/**
 * Copyright (c) 2022 Gitpod GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License-AGPL.txt in the project root for license information.
 */

import { User } from "@gitpod/gitpod-protocol";
import { skipIfEnvVarNotSet } from "@gitpod/gitpod-protocol/lib/util/skip-if";
import { Container, ContainerModule } from "inversify";
import { retries, suite, test, timeout } from "mocha-typescript";
import { expect } from 'chai';
import { GitpodHostUrl } from "@gitpod/gitpod-protocol/lib/util/gitpod-host-url";
import { BitbucketServerFileProvider } from "./bitbucket-server-file-provider";
import { AuthProviderParams } from "../auth/auth-provider";
import { BitbucketServerContextParser } from "./bitbucket-server-context-parser";
import { BitbucketServerTokenHelper } from "./bitbucket-server-token-handler";
import { TokenService } from "../user/token-service";
import { Config } from "../config";
import { TokenProvider } from "../user/token-provider";
import { BitbucketServerApi } from "./bitbucket-server-api";
import { HostContextProvider } from "../auth/host-context-provider";

@suite.only(timeout(10000), retries(2), skipIfEnvVarNotSet("GITPOD_TEST_TOKEN_BITBUCKET_SERVER"))
class TestBitbucketServerFileProvider {

    protected service: BitbucketServerFileProvider;
    protected user: User;

    static readonly AUTH_HOST_CONFIG: Partial<AuthProviderParams> = {
        id: "MyBitbucketServer",
        type: "BitbucketServer",
        verified: true,
        description: "",
        icon: "",
        host: "bitbucket.gitpod-self-hosted.com",
        oauth: {
            callBackUrl: "",
            clientId: "not-used",
            clientSecret: "",
            tokenUrl: "",
            scope: "",
            authorizationUrl: "",
        }
    }

    public before() {
        const container = new Container();
        container.load(new ContainerModule((bind, unbind, isBound, rebind) => {
            bind(BitbucketServerFileProvider).toSelf().inSingletonScope();
            bind(BitbucketServerContextParser).toSelf().inSingletonScope();
            bind(AuthProviderParams).toConstantValue(TestBitbucketServerFileProvider.AUTH_HOST_CONFIG);
            bind(BitbucketServerTokenHelper).toSelf().inSingletonScope();
            bind(TokenService).toConstantValue({
                createGitpodToken: async () => ({ token: { value: "foobar123-token" } })
            } as any);
            bind(Config).toConstantValue({
                hostUrl: new GitpodHostUrl()
            });
            bind(TokenProvider).toConstantValue(<TokenProvider>{
                getTokenForHost: async () => {
                    return {
                        value: process.env["GITPOD_TEST_TOKEN_BITBUCKET_SERVER"] || "undefined",
                        scopes: []
                    }
                },
                getFreshPortAuthenticationToken: undefined as any,
            });
            bind(BitbucketServerApi).toSelf().inSingletonScope();
            bind(HostContextProvider).toConstantValue({
                get: (hostname: string) => { authProvider: { "BBS" } }
            });
        }));
        this.service = container.get(BitbucketServerFileProvider);
        this.user = {
            creationDate: "",
            id: "user1",
            identities: [
                {
                    authId: "user1",
                    authName: "AlexTugarev",
                    authProviderId: "MyBitbucketServer",
                }
            ]

        };
    }

    @test async test_getGitpodFileContent_ok() {
        const result = await this.service.getGitpodFileContent({ repository: {
            cloneUrl: "https://bitbucket.gitpod-self-hosted.com/projects/FOO/repos/repo123"
        } } as any, this.user)
        expect(result).not.to.be.empty;
    }

}

module.exports = new TestBitbucketServerFileProvider();