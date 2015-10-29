var r = require("rethinkdb");
var app = require("koa")();
var router = require("koa-router")();
var multipart = require("co-multipart");
var bluebird = require("bluebird");
var socketio = require("socket.io");
var http = require("http");

var config = require("./config");

app.use(router.routes());
app.use(require("koa-bodyparser")());
app.use(require("koa-static")(`${__dirname}/public`));

var fileToBuffer = bluebird.promisify(require("fs").readFile);

router.post("/image/upload", function*() {
  var parts = yield* multipart(this);
  var part = parts.files[0];

  var conn = yield r.connect(config.database);
  yield r.table("photos").insert({
    filename: part.filename,
    mimetype: part.mime,
    image: yield fileToBuffer(part.path),
    time: r.now()
  }).run(conn);

  conn.close();
  parts.dispose();

  this.body = {success: true};
});

router.get("/image/:id", function *() {
  var conn = yield r.connect(config.database);
  var output = yield r.table("photos").get(this.params.id).run(conn);
  this.body = output.image;
  conn.close();
});

router.get("/recent", function *() {
  var conn = yield r.connect(config.database);
  this.body = yield r.table("photos")
                     .orderBy({index: r.desc("time")})
                     .without("image").limit(20)
                     .coerceTo("array").run(conn);
  conn.close();
});

var server = http.createServer(app.callback());
var io = socketio(server);

bluebird.coroutine(function*() {
  var conn = yield r.connect(config.database);

  try {
    yield r.dbCreate(config.database.db).run(conn);
    yield r.tableCreate("photos").run(conn);
    yield r.table("photos").indexCreate("time").run(conn);
  }
  catch (err) {
    if (err.message.indexOf("already exists") < 0)
      console.log(err.message);
  }

  (yield r.table("photos").changes().run(conn)).each((err, item) => {
    if (item && item.new_val)
      io.sockets.emit("photo", item.new_val.id);
  });
})();

server.listen(config.port, () =>
  console.log(`Server starting on port ${config.port}`));
