var Related   = require('./related')
var pull      = require('pull-stream')
var ViewLevel = require('flumeview-level')
var u         = require('./util')
var stdopts   = u.options
var Format    = u.formatStream

module.exports = function (db, config, keys) {

  db
    .use('time', ViewLevel(1, function (data) {
      return [data.timestamp]
    }))
    .use('feed', require('./indexes/feed')())
    .use('links', require('./indexes/links')(keys))

  db.createLogStream = function (opts) {
    opts = stdopts(opts)
    if(opts.raw)
      return db.stream()

    var keys = opts.keys; delete opts.keys
    var values = opts.values; delete opts.values
    return pull(db.time.read(opts), Format(keys, values))
  }

  //TODO: eventually, this should filter out authors you do not follow.
  db.createFeedStream = db.feed.createFeedStream

  db.createUserStream = db.clock.createUserStream

  db.latest = db.last.latest

  //used by sbot replication plugin
  db.latestSequence = function (id, cb) {
    db.last.get(function (err, val) {
      if(err) cb(err)
      else if (!val || !val[id]) cb(new Error('not found:'+id))
      else cb(null, val[id].sequence)
    })
  }

  db.getLatest = function (key, cb) {
    db.last.get(function (err, value) {
      if(err || !value || !value[key]) cb()
      //Currently, this retrives the previous message.
      //but, we could rewrite validation to only use
      //data the reduce view, so that no disk read is necessary.
      else db.get(value[key].id, function (err, msg) {
        cb(err, {key: value[key].id, value: msg})
      })
    })
  }

  db.messagesByType = db.links.messagesByType

  db.links = db.links.links

  var HI = undefined, LO = null

  //get all messages that link to a given message.

  db.relatedMessages = Related(db)

  return db


}



