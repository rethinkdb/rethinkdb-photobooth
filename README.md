# RethinkDB Photobooth

We decided to build a photobooth for our office, using a Raspberry Pi, RethinkDB, React, and some realtime magic.

There are two apps in this project:

  - **Photobooth:** Frontend UI for Raspberry Pi photobooth that lets users take pictures, backed by a RethinkDB database.
  - **Photoboooth Manager:** Backend UI that lets an administrator manage photos. When running, will tweet out new photos as they arrive.

These apps work together to demonstrate a realtime architecture with multiple apps, powered by [RethinkDB changefeeds](http://rethinkdb.com/docs/changefeeds/).

You will need to install [GraphicsMagick](http://www.graphicsmagick.org/) before running the app.

  - On OS X, you can use `brew install graphicsmagick`.
  - On Ubuntu, you can use `apt-get install graphicsmagick`.
