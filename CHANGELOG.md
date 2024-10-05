# u-wave-core change log

All notable changes to this project will be documented in this file.

This project adheres to [Semantic Versioning](http://semver.org/).

## 0.5.0-alpha.20 / 28 Sep 2024
This is an alpha release, but new servers should use this version rather than an older "stable" one.

Features:
 * Automatically leave the booth after your current play by `PUT /api/booth/leave`. (#600, #642)

## 0.5.0-alpha.19 / 06 Feb 2024
This is an alpha release, but new servers should use this version rather than an older "stable" one.

Features:
 * Improve `/api/booth/history` performance. (#605, 49cb49c)

## 0.5.0-alpha.17 / 01 Dec 2023
This is an alpha release, but new servers should use this version rather than an older "stable" one.

Features:
 * Duplicate emote names in the emote integrations are now distinguished by adding `~1`, `~2`, etc. suffixes. (#597)

Bugfixes:
 * Fix startup, authentication, and `/api/now` crashes if Redis or user cookies contain bad data. (#596, c9ed5f1, 693520b)

Internal:
 * Use ES modules. (#558)
 * **Breaking:** üWave now requires Node.js 18.18 or above.

## 0.5.0-alpha.16 / 08 Mar 2023
This is an alpha release, but new servers should use this version rather than an older "stable" one.

Bugfixes:
 * Fix some crashes in the new emote integrations, and support Twitch and FrankerFaceZ emotes. (#555)

## 0.5.0-alpha.15 / 08 Mar 2023
This is an alpha release, but new servers should use this version rather than an older "stable" one.

Features:
 * Add experimental BTTV / 7TV emote integrations. (#554)

## 0.5.0-alpha.14 / 08 Dec 2022
This is an alpha release, but new servers should use this version rather than an older "stable" one.

Bugfixes:
 * Fix result count when filtering playlist items. (#546)

## 0.5.0-alpha.13 / 05 Nov 2022
This is an alpha release, but new servers should use this version rather than an older "stable" one.

Internal:
 * Finish booth advances while shutting down the server. (#543)

## 0.5.0-alpha.12 / 30 Oct 2022
This is an alpha release, but new servers should use this version rather than an older "stable" one.

Features:
 * Waitlist cycle can be disabled in the admin menu. (#519)
 * Waitlist lock state is now a setting in the admin menu. (#519)

Internal:
 * Test with MongoDB 6.0. (#536)
 * Test with Node.js 19. (539)
 * Replace use of deprecated `url` module by `URL` class. (#540)
 * Replace LGTM.com by Github Code Scanning. (#462)
 * Dependency updates.

## 0.5.0-alpha.11 / 27 Jun 2022
This is an alpha release, but new servers should use this version rather than an older "stable" one.

Features:
 * Update `u-wave-source-youtube`. This expects that clients use u-wave-web v2.0.0-alpha.9 or later.

Bugfixes:
 * Fix crash when a media source's `play()` hook throws. (#525)

Internal:
 * Do not rely on in-process event emitters. (#522)

## 0.5.0-alpha.10 / 23 May 2022
This is an alpha release, but new servers should use this version rather than an older "stable" one.

Features:
 * Make `artist`, `title` optional when adding playlist items (#516).
   With this change, deriving the artist and title for a search result can be deferred until it
   is actually added to a playlist. Then the search can show only original titles, which makes
   finding the correct result easier, and is required for compliance with ToS for some services.

Internal:
 * **Breaking:** üWave now requires Node.js 14.17 or above. (#513)
 * Use UUIDs for chat message IDs. (#511)

## 0.5.0-alpha.9 / 13 Nov 2021
This is an alpha release, but new servers should use this version rather than an older "stable" one.

Bugfixes:
 * Fix a crash in the `/api/users` endpoint. (#490)

Internal:
 * Fetch ACL sub-roles in a single database query. Should be good for performance, but most of all
   for code quality.

## 0.5.0-alpha.8 / 10 Nov 2021
This is an alpha release, but new servers should use this version rather than an older "stable" one.

Bugfixes:
 * Improve performance of searches with `?include=playlists`. (#489)
   Now it's actually usable :)

## 0.5.0-alpha.7 / 09 Nov 2021
This is an alpha release, but new servers should use this version rather than an older "stable" one.

Bugfixes:
 * Fix imports from some media sources (like Youtube).
 * Send data from `play()` hook in `/api/now` responses. (#486)
 * Fix adding media to the start of a playlist. (#487)

## 0.5.0-alpha.6 / 07 Nov 2021
This is an alpha release, but new servers should use this version rather than an older "stable" one.

This is a hotfix release for problems introduced during development of `alpha.5`.

Bugfixes:
 * **Breaking:** Revert `playedAt` to a UNIX timestamp.
   This fixes an accidental breaking change. I'm sorry if you updated your code already while tracking
   the development branch these past months :(
 * Make related playlists opt-in in search results. There is a serious performance problem in that
   feature, so it is available behind a query parameter for diagnostic purposes.
 * Fix registrations getting rejected when ReCaptcha is disabled.
 * Fix favouriting tracks.

## 0.5.0-alpha.5 / 07 Oct 2021
This is an alpha release, but new servers should use this version rather than an older "stable" one.

This one has many internal changes so please keep an eye on it when you deploy it and report any issues!

Features:
 * Add a native ES modules entry point.
 * Add `play()` hook for media sources. (#481)
   With this hook, media sources can provide data to clients that is needed for playback,
   such as expiring signed URLs to access a certain media.

Internal:
 * **Breaking**: Simplify `mongo` and `redis` options: you can now only pass URL strings.
 * Add type checking with jsdoc and typescript. (#442)
 * Upgrade dependencies.

## 0.5.0-alpha.4 / 15 April 2021

This is an alpha release, but new servers should use this version rather than an older "stable" one.

Features:
 * Add `helmet: false` option to disable CSP headers. This is necessary when running the API server and web client in the same Express app.

Internal:
 * Upgrade `ajv` to v8.

## 0.5.0-alpha.3 / 02 April 2021

This is an alpha release, but new servers should use this version rather than an older "stable" one.

Bugfixes:
* Show error message when trying to join the waitlist with an empty playlist. (#438)
* Fix `/api/now` error if user has no playlist. (#439)

## 0.5.0-alpha.2 / 13 May 2021

This is an alpha release, but new servers should use this version rather than an older "stable" one.

Bugfxes:
 * Fix google oauth config schema. (#433)

Internal:
 * **Breaking:** Remove option to disable default roles. (#437)
 * More tests. (#432)

## 0.5.0-alpha.1 / 28 Feb 2021

This is an alpha release, but new servers should use this version rather than an older "stable" one.

The `u-wave-http-api` package has been merged into `u-wave-core`. This package now contains both the library and the HTTP and WebSocket API for üWave servers.

The minimum supported Node.js version is v12.20.0.

`u-wave-core` now includes a basic CLI with some default configuration.

```bash
npm install --global u-wave-core@next
u-wave-core --help
```

Features:
 * **Breaking:** Merge `u-wave-http-api`. (#333)
 * Automatically activate a user's first playlist. (#219)
 * Implement votes using HTTP requests. (#361)
   * Older client versions can still use WebSocket votes.
 * Find playlists containing a particular media. (#374)
 * Add social authentication support. (#265, #385)
 * Add runtime configuration support. (#380, #408)
 * Add database migrations. (#410)
 * Add a CLI to run a basic, default-configuration server. (#391, #418)

Internal:
 * Add `uw.models` property for easier mongoose model access. (#283)
 * **Breaking:** Small changes to DB option handling. (#264)
 * **Breaking:** Raise supported Node.js version to 10+. (#342)
 * Make `getPlaylistItems` faster with a single query. (#351, #370)
 * Remove use of `p-props`. (#371)
 * **Breaking**: Handle startup with Avvio. (#400)
 * Use JSON schemas for request validation. (#416)
 * Move active playlist state from Redis into MongoDB. (#419)
 * More tests. (#417, #426)
 * Update `sourceData` values when adding media from search results. (#405)

## 0.4.1 / 17 Jul 2018

Bugfixes:
 * Fix changing passwords: (#280)
   * Fix finding Authentication method when resetting password.
   * Temporarily disable the `type: local` constraint on password changes.

## 0.4.0 / 15 Jul 2018

Features:
 * Implement filter parameter for getUsers(). (#220)
 * Move waitlist into core. (#250)

Internal:
 * Rename prepublish npm script to prepare.
 * Dependency updates.

## 0.3.2 / 03 Apr 2018

Bugfixes:

 * Add waitlist.join.locked permission to default moderator role. (#218)

## 0.3.1 / 29 Mar 2018

Bugfixes:

 * Assign "user" role by default. (#214)

## 0.3.0 / 18 Mar 2018

Features:

 * Add optional `user` parameter to media sources. (#133)
 * Use `IORedis#quit` instead of `IORedis#end`. (#139)
 * Implement bans. (#104)
 * Set a default avatar. (#146)
 * Generate cjs and es modules builds. (#166)
 * Accept user object in more playlist methods. (#183)
 * Add `users.findOrCreateSocialUser`. (#187)
 * Remove custom sourceType parameter. (#153)
 * Add login and password change to users plugin. (#200)
 * Publish ACL role changes. (#211)

Bugfixes:

 * Fix adding items to playlist. (#136)
 * Normalize unicode strings before inserting into DB. (#205)
 * Fix `acl.deleteRole`. (#207)
 * Use Redis sets to store votes. (#212)

## 0.2.2 / 09 Jul 2017

Features:

 * Implement locking during booth advances. (#124)

Bugfixes:

 * Skip user plays when their playlist is empty while entering the booth. (#121)

Internal:

 * Use temporary databases instead of mockgoose while running tests. (#123)

## 0.2.1 / 21 Jun 2017

Features:

 * Make email addresses case insensitive. (#112)

Internal:

 * Fix warnings in tests. (#113)
 * Ensure `Promise` always refers to bluebird. (#114)
 * Add Node 8 to Travis. (#115)

## 0.2.0 / 15 Jun 2017

Features:

 * Add option to disable default plugins. (300fc1deab73084fc9aec4852bbe116e00353aa0)
 * Add role-based ACL. (#60)
 * Implement retrieving play history. (#92)
 * Return a `Page` from `getUsers()`. (#87)
 * Show a more useful error message when the User slug is empty. (#101)

Internal:

 * Switch to `bcryptjs` from `bcrypt`. (#97)
 * Switch to `transliteration` from `speakingurl`. (#98)

## 0.1.0 / 30 Dec 2016

Start tracking changes.
