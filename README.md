# u-wave-core

[Website](https://u-wave.net) - [Server List](https://hub.u-wave.net) -
[![Discord](https://img.shields.io/discord/809070303593496656?label=discord&style=flat-square)](https://discord.gg/8vsdfwS8tm)

The backend server for üWave, the collaborative listening platform.

[Dependencies](#dependencies) - [Development](#development) - [API](#api) -
[License](#license)

## Dependencies

üWave consists of two parts: the server (this repository) and the web client.
The server on its own only provides an HTTP API, so you must also run the web
client to actually use it.

üWave requires a Redis database.

## Usage

üWave comes with an executable file that includes YouTube and SoundCloud
support by default. The server can be configured with environment variables.
You must provide a `YOUTUBE_API_KEY` to use YouTube. SoundCloud works
without API keys.

If you need more configuration options, your only option is to use the Node.js
API of this package, and write your own server entry point. Over time more
options will be made available through the CLI.

```bash
npx u-wave-core
```

Environment Variables:
 - `SECRET` - A secret key used for encrypting passwords. Must be a 64-character
    hexadecimal string (= 256 bits).
 - `PORT` - Port to listen on. Defaults to 6042.
 - `SQLITE_PATH` - Path to the database file to use. Defaults to `uwave.sqlite`.
 - `REDIS_URL` - URL of the Redis instance to connect to. Defaults to
   `redis://localhost:6379/`.
 - `YOUTUBE_API_KEY` (optional) - Your YouTube Data API key.

## Development

The server can be run in development mode by:

```bash
git clone https://github.com/u-wave/core u-wave-core
cd u-wave-core
npm install
npm start
```

The development server reads configuration from a `.env` file in the root
of the repository.

```bash
# Database connection URLs.
REDIS_URL=redis://localhost:6379/
SQLITE_PATH=uwave_dev.sqlite

# Enables the YouTube media source if given.
YOUTUBE_API_KEY=your key
```

## API

> You only need to use the API if you are integrating the üWave library with your
> own app.

API documentation is very incomplete and might change a lot before 1.0.0.
Take care!

See the [example/][example] directory for a usage example.

### uw = uwave(options={})

Create and start a üWave server.

**Parameters**

 - `sqlite` - Path to the SQLite database file.
 - `redis` - A Redis connection URL.

### uw.source(sourcePlugin, options={})

Add a media source plugin. Source plugins can be used to search and import media
from remote sources like YouTube or SoundCloud. Existing source plugins can be
found on npm with the [u-wave-source keyword][].

**Parameters**

 * `sourcePlugin` - Source plugin or plugin factory. Receives two parameters:
   The `uw` üWave Core instance, and the plugin options.
 * `options` - Options to pass to the source plugin.

### uw.close(): Promise

Stops the üWave server.

## License

[MIT][]

[IORedis]: https://github.com/luin/ioredis
[u-wave-source keyword]: https://www.npmjs.com/browse/keyword/u-wave-source

[example]: example/
[MIT]: ./LICENSE
