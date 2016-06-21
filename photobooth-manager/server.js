'use strict';

const r = require('rethinkdb');
const app = require('koa')();
const router = require('koa-router')();
const send = require('koa-send');
const bluebird = require('bluebird');
const socketio = require('socket.io');
const http = require('http');
const path = require('path');
const Twitter = require('node-twitter-api');
const limit = require("simple-rate-limiter");

const config = require('./config');

// Get the photos in the photobooth
router.get('/photos/', function *() {
    let conn = yield r.connect(config.database);
    // Get recent photos, excluding the binary data stored in the document
    // (to keep the document size small)
    this.body = yield r.table('photos')
        .orderBy({index: r.asc('time')})
        .without('image')
        .coerceTo('array').run(conn);
    conn.close();
});

// Delete a specific photo (by ID)
router.del('/photos/:id', function *() {
    let conn = yield r.connect(config.database);
    let photo = yield r.table('photos').get(this.params.id).delete().run(conn);
    conn.close();
    this.body = { status: 200, body: {success: true}};
});

// Get a specific photo (by ID)
router.get('/photos/:id', function *() {
    // Serve the specific photo from the photos directory
    yield send(this, `${this.params.id}.png`, { root: config.photo_dir });
});

// Tweet a specific photo (by ID)
router.get('/tweet/:id', function *() {
    let conn = yield r.connect(config.database);
    let photo = yield r.table('photos').get(this.params.id).run(conn);
    conn.close();
    // Tweet it using the filename stored in RethinkDB
    tweetPhoto(photo.filename, 'New photo from the @rethinkdb photobooth:');
    this.body = { status: 200, body: {success: true }};
});

// Set up koa-router
app.use(router.routes());
app.use(router.allowedMethods());

// Serve static files
app.use(require('koa-bodyparser')());
app.use(require('koa-static')(`${__dirname}/public`));

// Establish a Twitter client based on our config
const twitterClient = new Twitter(config.twitter);
// Set up the HTTP server and Socket.io
const server = http.createServer(app.callback());
const io = socketio(server);

// Set up the server with a few RethinkDB calls
bluebird.coroutine(function*() {
    let conn = yield r.connect(config.database);

    // Create the photos table and indexes if they don't already exists
    try {
        yield r.dbCreate(config.database.db).run(conn);
        yield r.tableCreate('photos').run(conn);
        yield r.table('photos').indexCreate('time').run(conn);
    }
    catch (err) {
        if (err.message.indexOf('already exists') < 0)
            console.log(err.message);
    }

    // Every time there's a new photo:
    //  - emit it with Socket.io
    //  - tweet it on Twitter.
    (yield r.table('photos').changes().run(conn)).each((err, item) => {
        if (item && item.new_val) {
            io.sockets.emit('photo added', item.new_val);
            tweetPhoto(item.new_val.filename, 'New photo from the @rethinkdb photobooth:');
        } else if (item.new_val == null) {
            io.sockets.emit('photo removed', item.old_val);
        }
    });
})();

// Tweet the photo:
// - set up Twitter rate limiting: 100 per hour
const tweetPhoto = limit(function(filename, status) {
    // Tweet the photo with the status
    twitterClient.uploadMedia({media: filename},
        config.twitter.accessToken,
        config.twitter.accessSecret,
        (err, response) => {
            twitterClient.statuses('update', {
                status: status,
                media_ids: response.media_id_string
            },
            config.twitter.accessToken,
            config.twitter.accessSecret,
            (err, response) => {
                if (err)
                    console.log('Twitter error:', err);
                else
                    console.log('Tweeted photo.');
            });
        }
    );
//});
}).to(100).per(1000*60*60);


// Start the server
server.listen(config.port, () =>
    console.log(`Server starting on port ${config.port}`));
