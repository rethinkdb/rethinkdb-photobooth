'use strict';

const r = require('rethinkdb');
const app = require('koa')();
const router = require('koa-router')();
const send = require('koa-send');
const multipart = require('co-multipart');
const parse = require('co-busboy')
const bluebird = require('bluebird');
const socketio = require('socket.io');
const http = require('http');
const path = require('path');
const fs = require('fs');
const gm = require('gm');


const config = require('./config');

router.post('/photo/upload', function*() {

    // Generate a unique ID and filename
    let conn = yield r.connect(config.database);
    let id = yield r.uuid().run(conn);
    conn.close();
    let filename = path.resolve(config.photo_dir, `${id}.png`);
    let thumbnail = path.resolve(config.photo_dir, 'thumbnails', `${id}.png`);

    // Upload the photo
    let parts = parse(this);
    let part;
    while (part = yield parts) {
        // Make sure we have a stream (not busboy fields)
        if (!part.length) {
            // Write the file to our photos directory
            part.pipe(fs.createWriteStream(filename));
            // Upload of original photo finished
            part.on('end', () => {
                // Add thumbnail
                gm(filename)
                    .resize(275)
                    .noProfile()
                    .write(thumbnail, function(err) {
                        if (err) console.log(`Couldn't resize image ${id}.png: ${err}`);
                        else {
                          // Store metadata on the photo
                          bluebird.coroutine(function*() {
                              console.log('Uploaded photo:',filename);
                              let conn = yield r.connect(config.database);
                              let new_photo = yield r.table('photos').insert({
                                  id: id,
                                  filename: filename,
                                  mimetype: 'image/png',
                                  time: r.now()
                              }).run(conn);
                              conn.close();
                          })();
                        }
                    });
            });
        }
    }

    this.body = { status: 200, body: {success: true}}
});

// Get a specific photo (by ID)
router.get('/photos/:id', function *() {
    // Serve the specific photo from the photos directory
    yield send(this, `${this.params.id}.png`, { root: config.photo_dir });
});

// Get a specific thumbnail (by ID)
router.get('/thumbnails/:id', function *() {
    // Serve the specific thumbnail from the thumbnails directory
    let photosRoot = path.resolve(config.photo_dir, 'thumbnails');
    yield send(this, `${this.params.id}.png`, { root: photosRoot });
});

// Get the recent photos
router.get('/recent', function *() {
    let conn = yield r.connect(config.database);
    // Get recent 20 photos
    this.body = yield r.table('photos')
        .orderBy({index: r.desc('time')})
        .limit(20)
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
