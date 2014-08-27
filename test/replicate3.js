'use strict';

var pull      = require('pull-stream')
var tape      = require('tape')
var net       = require('net')

var u         = require('../util')
var replicate = require('../replicate')

//create a instance with a feed
//then have another instance follow it.

function rand (n) {
  var a = []
  while(n--)
    a.push(Math.random())
  return a
}
var z = 0

module.exports = function (opts, duplexPipe, name) {
  var s = z++
  var w = require('./util')(opts)

  //used to hash the feed output to make assertion failures easier to eyeball.
  function hash(msg) {
    return opts.hash(opts.codec.encode(msg)).toString('hex')
  }

  function createSimple(n,m) {
    tape(name + ': simple replicate ' + JSON.stringify([n,m]), function (t) {
      var s = ''+ z++

      var sbs1 = w.createDB('sbs-replicate1_' + name + s)
      var sbs2 = w.createDB('sbs-replicate2_' + name + s)

      var cb1 = u.groups(done)

      var f1 = w.init(sbs1, n, cb1())
      var f2 = w.init(sbs2, m, cb1())

      sbs2.follow(opts.hash(f1.public), cb1())
      sbs1.follow(opts.hash(f2.public), cb1())

      var ary = [], n = 1

      function done (err) {
        console.log('initialized')

        if(err) throw err
        var cb2 = u.groups(done2)

        var a = replicate(sbs1, cb2())
        var b = replicate(sbs2, cb2())

        duplexPipe(a, b)

        function done2 (err) {
          console.log('REPLICATED')
          if(err) throw err
          //now check that the databases have really been updated.

          var cbs = u.groups(next)

          pull(sbs1.createFeedStream(), pull.collect(cbs()))
          pull(sbs2.createFeedStream(), pull.collect(cbs()))

          function next (err, ary) {
            if(err) throw err

//            t.deepEqual(ary[0], ary[1])
            t.deepEqual(ary[0].map(hash), ary[1].map(hash))

            console.log('replicated!!!')
            t.end()
          }
        }
      }
    })

  }

  createSimple(1, 1)

  createSimple(1, 2)

  //this one is failing with net currently.
  createSimple(3, 2)

  tape(name + ': 3-way replicate', function (t) {

    var sbs1 = w.createDB('sbs-3replicate1_' + name + s)
    var sbs2 = w.createDB('sbs-3replicate2_' + name + s)
    var sbs3 = w.createDB('sbs-3replicate3_' + name + s)

    var cb1 = u.groups(done)

    var f1 = w.init(sbs1, 10, cb1())
    var f2 = w.init(sbs2, 15, cb1())
    var f3 = w.init(sbs3, 20, cb1())

    sbs1.follow(opts.hash(f2.public), cb1())
    sbs1.follow(opts.hash(f3.public), cb1())

    sbs2.follow(opts.hash(f1.public), cb1())
    sbs2.follow(opts.hash(f3.public), cb1())

    sbs3.follow(opts.hash(f1.public), cb1())
    sbs3.follow(opts.hash(f2.public), cb1())

    var ary = []

    function done (err) {
      if(err) throw err
      var cb2 = u.groups(done2)

      var a = replicate(sbs1, cb2())
      var b = replicate(sbs2, cb2())

      duplexPipe(a, b)

      function done2 (err) {
        if(err) throw err
        //now check that the databases have really been updated.

        var cb3 = u.groups(done3)

        var c = sbs3.createReplicationStream(cb3())
        var d = sbs2.createReplicationStream(cb3())

        duplexPipe(c, d)

        function done3 (err) {
          if(err) throw err

          var cbs = u.groups(next)

          pull(sbs2.createFeedStream(), pull.collect(cbs()))
          pull(sbs3.createFeedStream(), pull.collect(cbs()))

          function next (err, ary) {
            if(err) throw err

  //          t.deepEqual(ary[0], ary[1])
            t.deepEqual(ary[0].map(hash), ary[1].map(hash))

            console.log('replicated!!!')
            t.end()
          }
        }
      }
    }
  })


}

if(!module.parent) {
  var opts = require('../defaults')

  module.exports(opts, function (a, b) {
    pull(a,
//      pull.through(function (e) {console.log('>>>', e)}),
      b,
//      pull.through(function (e) {console.log('<<<', e)}),
      a)
  }, 'pull-stream')

  var toStream = require('pull-stream-to-stream')
  module.exports(opts, function (a, b) {
    var server = net.createServer(function (stream) {
      stream.pipe(toStream(a)).pipe(stream)
    }).listen(function () {
      var stream = net.connect(server.address().port)
      stream.pipe(toStream(b)).pipe(stream)
      stream.on('close', function () {
        server.close()
      })
    })
  }, 'net')


}
