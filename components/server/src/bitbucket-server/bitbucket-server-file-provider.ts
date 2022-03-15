/**
 * Copyright (c) 2020 Gitpod GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License-AGPL.txt in the project root for license information.
 */

import { Commit, Repository, User } from "@gitpod/gitpod-protocol";
import { inject, injectable } from "inversify";
import { FileProvider, MaybeContent } from "../repohost/file-provider";
import { BitbucketServerApi } from "./bitbucket-server-api";
import { BitbucketServerContextParser } from "./bitbucket-server-context-parser";

@injectable()
export class BitbucketServerFileProvider implements FileProvider {

    @inject(BitbucketServerApi) protected api: BitbucketServerApi;
    @inject(BitbucketServerContextParser) protected contextParser: BitbucketServerContextParser;

    public async getGitpodFileContent(commit: Commit, user: User): Promise<MaybeContent> {
        return this.getFileContent(commit, user, '.gitpod.yml')
    }

    public async getLastChangeRevision(
        repository: Repository,
        revisionOrBranch: string,
        user: User,
        path: string,
    ): Promise<string> {
        // try {
        //     const api = await this.apiFactory.create(user);
        //     const fileMetaData = (await api.repositories.readSrc({ workspace: repository.owner, repo_slug: repository.name, commit: revisionOrBranch, path, format: "meta" })).data;
        //     return (fileMetaData as any).commit.hash;
        // } catch (err) {
        //     log.error({ userId: user.id }, err);
        //     throw new Error(`Could not fetch ${path} of repository ${repository.owner}/${repository.name}: ${err}`);
        // }
        return "f00";
    }

    public async getFileContent(commit: Commit, user: User, path: string) {
        if (!commit.revision || !commit.repository.webUrl) {
            return undefined;
        }

        const { owner, repoName, resourceKind } = await this.contextParser.parseURL(user, commit.repository.webUrl);

        try {
            const result = await this.api.fetchContent(user, `/${resourceKind}/${owner}/repos/${repoName}/raw/${path}`);
            return result;
        } catch (err) {
            console.error({ userId: user.id }, err);
        }
    }
}
