var r = require('rethinkdb');
var app = require('koa')();
var router = require('koa-router')();
var bluebird = require('bluebird');
var socketio = require('socket.io');
var http = require('http');
var Twitter = require('node-twitter-api');

var config = require('./config');


// Get the photos in the photobooth
router.get('/photos/', function *() {
    var conn = yield r.connect(config.database);
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
    var conn = yield r.connect(config.database);
    var output = yield r.table('photos').get(this.params.id).delete().run(conn);
    conn.close();
    this.body = { status: 200, body: {success: true}}
});

// Get a specific photo (by ID)
router.get('/photos/:id', function *() {
    var conn = yield r.connect(config.database);
    var output = yield r.table('photos').get(this.params.id).run(conn);
    conn.close();
    this.body = output.image;
})


// Set up koa-router
app.use(router.routes());
app.use(router.allowedMethods());

// Serve static files
app.use(require('koa-bodyparser')());
app.use(require('koa-static')(`${__dirname}/public`));

// Establish a Twitter client based on our config
var twitterClient = new Twitter(config.twitter);
// Set up the HTTP server and Socket.io
var server = http.createServer(app.callback());
var io = socketio(server);

// Set up the server with a few RethinkDB calls
bluebird.coroutine(function*() {
    var conn = yield r.connect(config.database);

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

    // Every time there's a new photo, emit it with Socket.io
    //   - exclude the binary image data to keep the document size small
    // ... then tweet it on Twitter.
    (yield r.table('photos').changes().without('image').run(conn)).each((err, item) => {
        if (item && item.new_val) {
            io.sockets.emit('photo added', item.new_val);
            tweetPhoto('Hanging out with the Thinker!', item.image);
        } else if (item.new_val == null) {
            io.sockets.emit('photo removed', item.old_val);
        }
    });
})();

var tweetPhoto = bluebird.coroutine(function*(image, status) {
    // Tweet the photo with the status
    /*yield twitterClient.uploadMedia(
        {media: image},
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
                console.log('Tweeted:', err, response);
            });
        }
    );*/
});

// Start the server
server.listen(config.port, () =>
    console.log(`Server starting on port ${config.port}`));
