/**
 * Copyright (c) 2020 Gitpod GmbH. All rights reserved.
 * Licensed under the Gitpod Enterprise Source Code License,
 * See License.enterprise.txt in the project root folder.
 */

import { RepositoryService } from "../../../src/repohost/repo-service";
import { User } from "@gitpod/gitpod-protocol";
import { inject, injectable } from "inversify";
import { BitbucketServerApi, BitbucketServer } from "../../../src/bitbucket-server/bitbucket-server-api";
import { AuthProviderParams } from "../../../src/auth/auth-provider";
import { BitbucketServerContextParser } from "../../../src/bitbucket-server/bitbucket-server-context-parser";
import { Config } from "../../../src/config";
import { TokenService } from "../../../src/user/token-service";

@injectable()
export class BitbucketServerService extends RepositoryService {

    static PREBUILD_TOKEN_SCOPE = 'prebuilds';

    @inject(BitbucketServerApi) protected api: BitbucketServerApi;
    @inject(Config) protected readonly config: Config;
    @inject(AuthProviderParams) protected authProviderConfig: AuthProviderParams;
    @inject(TokenService) protected tokenService: TokenService;
    @inject(BitbucketServerContextParser) protected contextParser: BitbucketServerContextParser;

    async canInstallAutomatedPrebuilds(user: User, cloneUrl: string): Promise<boolean> {
        const { host, resourceKind, owner, repoName } = await this.contextParser.parseURL(user, cloneUrl);
        if (host !== this.authProviderConfig.host) {
            return false;
        }

        const identity = user.identities.find(i => i.authProviderId === this.authProviderConfig.id);
        if (!identity) {
            console.error(`Unexpected call of canInstallAutomatedPrebuilds. Not authorized with ${this.authProviderConfig.host}.`);
            return false;
        }

        try {
            await this.api.getWebhooks(user, { resourceKind, repositorySlug: repoName, userOrProject: owner });
            // reading webhooks to check if admin scope is provided
        } catch (error) {
            return false;
        }

        const permissions = await this.api.runQuery<BitbucketServer.Paginated<BitbucketServer.PermissionEntry>>(user, `/${resourceKind}/${owner}/repos/${repoName}/permissions/users`);
        const ownPermission = permissions.values?.find(p => p.user.name === identity?.authName)?.permission;
        if (ownPermission === "REPO_ADMIN") {
            return true;
        }

        console.debug(`User is not allowed to install webhooks.\n${JSON.stringify(identity)}\n${JSON.stringify(permissions)}`);
        return false;
    }

    async installAutomatedPrebuilds(user: User, cloneUrl: string): Promise<void> {
        const { owner, repoName, resourceKind } = await this.contextParser.parseURL(user, cloneUrl);

        const existing = await this.api.getWebhooks(user, { resourceKind, repositorySlug: repoName, userOrProject: owner });
        const hookUrl = this.getHookUrl();
        if (existing.values &&
            existing.values.some(hook => hook.url && hook.url.indexOf(hookUrl) !== -1)) {
            console.log(`BBS webhook already installed on ${cloneUrl}`);
            return;
        }
        const tokenEntry = await this.tokenService.createGitpodToken(user, BitbucketServerService.PREBUILD_TOKEN_SCOPE, cloneUrl);
        const result = await this.api.setWebhook(user, { resourceKind, repositorySlug: repoName, userOrProject: owner }, {
            name: "tada",
            active: true,
            configuration: {
                secret: "foobar123-secret"
            },
            url: hookUrl + `?token=${user.id + '|' + tokenEntry.token.value}`,
            events: [
                "repo:refs_changed"
            ]
        });
        console.log(result)
        // const response = await api.repositories.createWebhook({
        //     repo_slug: repoName,
        //     workspace: owner,
        //     // see https://developer.atlassian.com/bitbucket/api/2/reference/resource/repositories/%7Bworkspace%7D/%7Brepo_slug%7D/hooks#post
        //     _body: {
        //         "description": `Gitpod Prebuilds for ${this.config.hostUrl}.`,
        //         "url": hookUrl + `?token=${user.id + '|' + tokenEntry.token.value}`,
        //         "active": true,
        //         "events": [
        //             "repo:push"
        //         ]
        //     }
        // });
        // if (response.status !== 201) {
        //     throw new Error(`Couldn't install webhook for ${cloneUrl}: ${response.status}`);
        // }
        console.log('Installed Bitbucket Webhook for ' + cloneUrl);
    }

    protected getHookUrl() {
        return this.config.hostUrl.with({
            // pathname: BitbucketServerApp.path
        }).toString();
    }
}