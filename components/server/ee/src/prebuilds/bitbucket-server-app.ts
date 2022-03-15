/**
 * Copyright (c) 2022 Gitpod GmbH. All rights reserved.
 * Licensed under the Gitpod Enterprise Source Code License,
 * See License.enterprise.txt in the project root folder.
 */

import * as express from 'express';
import { postConstruct, injectable, inject } from 'inversify';
import { ProjectDB, TeamDB, UserDB } from '@gitpod/gitpod-db/lib';
import { PrebuildManager } from '../prebuilds/prebuild-manager';
import { TokenService } from '../../../src/user/token-service';

@injectable()
export class BitbucketServerApp {

    @inject(UserDB) protected readonly userDB: UserDB;
    @inject(PrebuildManager) protected readonly prebuildManager: PrebuildManager;
    @inject(TokenService) protected readonly tokenService: TokenService;
    @inject(ProjectDB) protected readonly projectDB: ProjectDB;
    @inject(TeamDB) protected readonly teamDB: TeamDB;

    protected _router = express.Router();
    public static path = '/apps/bitbucketserver/';

    @postConstruct()
    protected init() {
        this._router.post('/', async (req, res) => {
            try {
                console.warn("BBS web hook event.", { headers: req.headers, body: req.body })
            } catch (err) {
                console.error(`Couldn't handle request.`, err, { headers: req.headers, reqBody: req.body });
            } finally {
                // we always respond with OK, when we received a valid event.
                res.sendStatus(200);
            }
        });
    }

    // protected async findUser(ctx: TraceContext, secretToken: string): Promise<User> {
    //     const span = TraceContext.startSpan("BitbucketApp.findUser", ctx);
    //     try {
    //         span.setTag('secret-token', secretToken);
    //         const [userid, tokenValue] = secretToken.split('|');
    //         const user = await this.userDB.findUserById(userid);
    //         if (!user) {
    //             throw new Error('No user found for ' + secretToken + ' found.');
    //         } else if (!!user.blocked) {
    //             throw new Error(`Blocked user ${user.id} tried to start prebuild.`);
    //         }
    //         const identity = user.identities.find(i => i.authProviderId === TokenService.GITPOD_AUTH_PROVIDER_ID);
    //         if (!identity) {
    //             throw new Error(`User ${user.id} has no identity for '${TokenService.GITPOD_AUTH_PROVIDER_ID}'.`);
    //         }
    //         const tokens = await this.userDB.findTokensForIdentity(identity);
    //         const token = tokens.find(t => t.token.value === tokenValue);
    //         if (!token) {
    //             throw new Error(`User ${user.id} has no token with given value.`);
    //         }
    //         return user;
    //     } finally {
    //         span.finish();
    //     }
    // }

    // protected async handlePushHook(ctx: TraceContext, data: ParsedRequestData, user: User): Promise<StartPrebuildResult | undefined> {
    //     const span = TraceContext.startSpan("Bitbucket.handlePushHook", ctx);
    //     try {
    //         const contextURL = this.createContextUrl(data);
    //         span.setTag('contextURL', contextURL);
    //         const config = await this.prebuildManager.fetchConfig({ span }, user, contextURL);
    //         if (!this.prebuildManager.shouldPrebuild(config)) {
    //             console.log('Bitbucket push event: No config. No prebuild.');
    //             return undefined;
    //         }

    //         console.debug('Bitbucket push event: Starting prebuild.', { contextURL });

    //         const projectAndOwner = await this.findProjectAndOwner(data.gitCloneUrl, user);

    //         const ws = await this.prebuildManager.startPrebuild({ span }, {
    //             user: projectAndOwner.user,
    //             project: projectAndOwner?.project,
    //             branch: data.branchName,
    //             contextURL,
    //             cloneURL: data.gitCloneUrl,
    //             commit: data.commitHash
    //         });
    //         return ws;
    //     } finally {
    //         span.finish();
    //     }
    // }

    // /**
    //  * Finds the relevant user account and project to the provided webhook event information.
    //  *
    //  * First of all it tries to find the project for the given `cloneURL`, then it tries to
    //  * find the installer, which is also supposed to be a team member. As a fallback, it
    //  * looks for a team member which also has a bitbucket.org connection.
    //  *
    //  * @param cloneURL of the webhook event
    //  * @param webhookInstaller the user account known from the webhook installation
    //  * @returns a promise which resolves to a user account and an optional project.
    //  */
    // protected async findProjectAndOwner(cloneURL: string, webhookInstaller: User): Promise<{ user: User, project?: Project }> {
    //     const project = await this.projectDB.findProjectByCloneUrl(cloneURL);
    //     if (project) {
    //         if (project.userId) {
    //             const user = await this.userDB.findUserById(project.userId);
    //             if (user) {
    //                 return { user, project };
    //             }
    //         } else if (project.teamId) {
    //             const teamMembers = await this.teamDB.findMembersByTeam(project.teamId || '');
    //             if (teamMembers.some(t => t.userId === webhookInstaller.id)) {
    //                 return { user: webhookInstaller, project };
    //             }
    //             for (const teamMember of teamMembers) {
    //                 const user = await this.userDB.findUserById(teamMember.userId);
    //                 if (user && user.identities.some(i => i.authProviderId === "Public-Bitbucket")) {
    //                     return { user, project };
    //                 }
    //             }
    //         }
    //     }
    //     return { user: webhookInstaller };
    // }

    // protected createContextUrl(data: ParsedRequestData) {
    //     const contextUrl = `${data.repoUrl}/src/${data.commitHash}/?at=${encodeURIComponent(data.branchName)}`;
    //     return contextUrl;
    // }

    get router(): express.Router {
        return this._router;
    }
}

// function toData(body: BitbucketPushHook): ParsedRequestData | undefined {
//     const branchName = body.push.changes[0]?.new?.name;
//     const commitHash = body.push.changes[0]?.new?.target?.hash;
//     if (!branchName || !commitHash) {
//         return undefined;
//     }
//     const result = {
//         branchName,
//         commitHash,
//         repoUrl: body.repository.links.html.href,
//         gitCloneUrl: body.repository.links.html.href + '.git'
//     }
//     if (!result.commitHash || !result.repoUrl) {
//         console.error('Bitbucket push event: unexpected request body.', body);
//         throw new Error('Unexpected request body.');
//     }
//     return result;
// }
