// Copyright (c) 2020 Gitpod GmbH. All rights reserved.
// Licensed under the GNU Affero General Public License (AGPL).
// See License-AGPL.txt in the project root for license information.

package cmd

import (
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/gitpod-io/gitpod/blobserve/pkg/config"
	"github.com/heptiolabs/healthcheck"

	"github.com/containerd/containerd/remotes"
	"github.com/containerd/containerd/remotes/docker"
	"github.com/docker/cli/cli/config/configfile"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/spf13/cobra"

	"github.com/gitpod-io/gitpod/blobserve/pkg/blobserve"
	"github.com/gitpod-io/gitpod/common-go/kubernetes"
	"github.com/gitpod-io/gitpod/common-go/log"
	"github.com/gitpod-io/gitpod/common-go/pprof"
)

var jsonLog bool
var verbose bool

// runCmd represents the run command
var runCmd = &cobra.Command{
	Use:   "run <config.json>",
	Short: "Starts the blobserve",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.GetConfig(args[0])
		if err != nil {
			log.WithError(err).WithField("filename", args[0]).Fatal("cannot load config")
		}

		var dockerCfg *configfile.ConfigFile
		if cfg.AuthCfg != "" {
			authCfg := cfg.AuthCfg
			if tproot := os.Getenv("TELEPRESENCE_ROOT"); tproot != "" {
				authCfg = filepath.Join(tproot, authCfg)
			}
			fr, err := os.OpenFile(authCfg, os.O_RDONLY, 0)
			if err != nil {
				log.WithError(err).Fatal("cannot read docker auth config")
			}

			dockerCfg = configfile.New(authCfg)
			err = dockerCfg.LoadFromReader(fr)
			fr.Close()
			if err != nil {
				log.WithError(err).Fatal("cannot read docker config")
			}
			log.WithField("fn", authCfg).Info("using authentication for backing registries")
		}

		reg := prometheus.NewRegistry()

		resolverProvider := func() remotes.Resolver {
			var resolverOpts docker.ResolverOptions
			if dockerCfg != nil {
				resolverOpts.Hosts = docker.ConfigureDefaultRegistries(
					docker.WithAuthorizer(authorizerFromDockerConfig(dockerCfg)),
				)
			}

			return docker.NewResolver(resolverOpts)
		}

		srv, err := blobserve.NewServer(cfg.BlobServe, resolverProvider)
		if err != nil {
			log.WithError(err).Fatal("cannot create blob server")
		}
		go srv.MustServe()

		if cfg.PProfAddr != "" {
			go pprof.Serve(cfg.PProfAddr)
		}
		if cfg.PrometheusAddr != "" {
			reg.MustRegister(
				collectors.NewGoCollector(),
				collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
			)

			handler := http.NewServeMux()
			handler.Handle("/metrics", promhttp.HandlerFor(reg, promhttp.HandlerOpts{}))

			go func() {
				err := http.ListenAndServe(cfg.PrometheusAddr, handler)
				if err != nil {
					log.WithError(err).Error("Prometheus metrics server failed")
				}
			}()
			log.WithField("addr", cfg.PrometheusAddr).Info("started Prometheus metrics server")
		}

		if cfg.ReadinessProbeAddr != "" {
			// use the first layer as source for the tests
			if len(cfg.BlobServe.Repos) < 1 {
				log.Panic("the configuration file do not contain static layers")
			}

			var repository string
			for k := range cfg.BlobServe.Repos {
				repository = k
			}
			staticLayerHost := strings.Split(repository, "/")[0]
			// Ensure we can resolve DNS queries, can access gcr.io and the local Registry is up and running
			health := healthcheck.NewHandler()
			health.AddReadinessCheck("dns", kubernetes.DNSCanResolveProbe(staticLayerHost, 1*time.Second))
			health.AddReadinessCheck("registry", kubernetes.NetworkIsReachableProbe(fmt.Sprintf("http://%v", repository)))
			health.AddLivenessCheck("dns", kubernetes.DNSCanResolveProbe(staticLayerHost, 1*time.Second))
			health.AddLivenessCheck("registry", kubernetes.NetworkIsReachableProbe(fmt.Sprintf("http://%v", repository)))

			go func() {
				if err := http.ListenAndServe(cfg.ReadinessProbeAddr, health); err != nil && err != http.ErrServerClosed {
					log.WithError(err).Panic("error starting HTTP server")
				}
			}()
		}

		log.Info("🏪 blobserve is up and running")
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan
	},
}

func init() {
	rootCmd.AddCommand(runCmd)
}

// FromDockerConfig turns docker client config into docker registry hosts
func authorizerFromDockerConfig(cfg *configfile.ConfigFile) docker.Authorizer {
	return docker.NewDockerAuthorizer(docker.WithAuthCreds(func(host string) (user, pass string, err error) {
		auth, err := cfg.GetAuthConfig(host)
		if err != nil {
			return
		}
		user = auth.Username
		pass = auth.Password
		return
	}))
}
