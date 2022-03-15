import * as fs from 'fs';
import { SpanStatusCode } from '@opentelemetry/api';
import { Werft } from './util/werft';
import { reportBuildFailureInSlack } from './util/slack';
import * as Tracing from './observability/tracing'
import * as VM from './vm/vm'
import { buildAndPublish } from './jobs/build/build-and-publish';
import { validateChanges } from './jobs/build/validate-changes';
import { prepare } from './jobs/build/prepare';
import { coverage } from './jobs/build/coverage';
import { deployToPreviewEnvironment } from './jobs/build/deploy-to-preview-environment';
import { triggerIntegrationTests } from './jobs/build/trigger-integration-tests';
import { jobConfig } from './jobs/build/job-config';

// Will be set once tracing has been initialized
let werft: Werft
const context: any = JSON.parse(fs.readFileSync('context.json').toString());

Tracing.initialize()
    .then((tracing: Tracing.Tracing) => {
        werft = new Werft("build")
        run(context, tracing)
    })
    .catch((err) => {
        werft.rootSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: err
        })

        if (context.Repository.ref === "refs/heads/main") {
            reportBuildFailureInSlack(context, err, () => process.exit(1));
        } else {
            console.log('Error', err)
            // Explicitly not using process.exit as we need to flush tracing, see tracing.js
            process.exitCode = 1
        }
    })
    .finally(() => {
        werft.phase("Stop kubectl port forwards", "Stopping kubectl port forwards")
        VM.stopKubectlPortForwards()

        werft.phase("Flushing telemetry", "Flushing telemetry before stopping job")
        werft.endAllSpans()
    })

async function run(context: any, tracing: Tracing.Tracing) {
    const config = jobConfig(werft, context, tracing)

    await validateChanges(werft, config)
    await prepare(werft, config)
    await buildAndPublish(werft, config)
    await coverage(werft, config)

    if (config.noPreview) {
        werft.phase("deploy", "not deploying");
        console.log("no-preview or publish-release is set");
        return
    }

    await deployToPreviewEnvironment(werft, config)
    await triggerIntegrationTests(werft, config, context.Owner)
}
