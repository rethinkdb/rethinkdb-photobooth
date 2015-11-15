var r = require("rethinkdb");
var Twitter = require("node-twitter-api");
var config = require("./config");

var twitterClient = new Twitter(config.twitter);

r.connect(config.database).then(function(conn) {
    return r.db("photobooth").table("photos").changes().run(conn);
})
.then(function(cursor) {
    cursor.each(function(err, item) {
        console.log("New Item:", item);
        if (item.new_val !== null)
            twitterClient.uploadMedia(
                    {media: item.new_val.image},
                    config.twitter.accessToken,
                    config.twitter.accessSecret,
                    function(err, result) {
                        console.log("Test:", err, result);
                        twitterClient.statuses("update", {
                            status: "New picture from the RethinkDB photobooth",
                            media_ids: result.media_id_string
                        },
                        config.twitter.accessToken,
                        config.twitter.accessSecret,
                        function(err, response) {
                            console.log("Tweeted:", err, response);
                        });
                    });
    });
});
