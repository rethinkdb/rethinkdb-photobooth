var r = require('rethinkdb');
var app = require('koa')();
var router = require('koa-router')();
var multipart = require('co-multipart');
var bluebird = require('bluebird');
var socketio = require('socket.io');
var http = require('http');

var config = require('./config');

// Get a file buffer
var fileToBuffer = bluebird.promisify(require('fs').readFile);

// Upload images as binary data to RethinkDB
router.post('/image/upload', function*() {
    var parts = yield* multipart(this);
    var part = parts.files[0];

    var conn = yield r.connect(config.database);
    yield r.table('photos').insert({
        filename: part.filename,
        mimetype: part.mime,
        image: yield fileToBuffer(part.path),
        time: r.now()
    }).run(conn);

    conn.close();
    parts.dispose();

    this.body = { status: 200, body: {success: true}}
});

// Get a specific image (by ID)
router.get('/image/:id', function *() {
    var conn = yield r.connect(config.database);
    var output = yield r.table('photos').get(this.params.id).run(conn);
    this.body = output.image;
    conn.close();
});

// Get the recent images
router.get('/recent', function *() {
    var conn = yield r.connect(config.database);
    // Get recent photos, excluding the binary data stored in the document
    // (to keep the document size small)
    this.body = yield r.table('photos')
        .orderBy({index: r.asc('time')})
        .limit(20)
        .without('image')
        .coerceTo('array').run(conn);
    conn.close();
});

// Set up koa-router
app.use(router.routes());
app.use(router.allowedMethods());

// Serve static files
app.use(require('koa-bodyparser')());
app.use(require('koa-static')(`${__dirname}/public`));

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

    // Every time there's a change to our photo collection
    //  - emit it with Socket.io
    //  - exclude the binary image data to keep the document size small
    (yield r.table('photos').changes().without('image').run(conn)).each((err, item) => {
        // Photo added
        if (item && item.new_val)
            io.sockets.emit('photo added', item.new_val);
        // Photo removed
        else if (item.new_val == null)
            io.sockets.emit('photo removed', item.old_val);
    });
})();

// Start the server
server.listen(config.port, () =>
    console.log(`Server starting on port ${config.port}`));
