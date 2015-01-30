// Generated by CoffeeScript 1.8.0
var Break, FETCH_AT_ONCE, ImapPool, ImapReporter, Mailbox, Message, NotFound, americano, async, computeNextStep, log, mailutils, _, _ref,
  __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

americano = require(MODEL_MODULE);

module.exports = Mailbox = americano.getModel('Mailbox', {
  accountID: String,
  label: String,
  path: String,
  lastsync: String,
  tree: function(x) {
    return x;
  },
  delimiter: String,
  uidvalidity: Number,
  attribs: function(x) {
    return x;
  }
});

Message = require('./message');

log = require('../utils/logging')({
  prefix: 'models:mailbox'
});

_ = require('lodash');

async = require('async');

mailutils = require('../utils/jwz_tools');

ImapPool = require('../imap/pool');

ImapReporter = require('../imap/reporter');

_ref = require('../utils/errors'), Break = _ref.Break, NotFound = _ref.NotFound;

FETCH_AT_ONCE = require('../utils/constants').FETCH_AT_ONCE;

require('../utils/socket_handler').wrapModel(Mailbox, 'mailbox');

Mailbox.RFC6154 = {
  draftMailbox: '\\Drafts',
  sentMailbox: '\\Sent',
  trashMailbox: '\\Trash',
  allMailbox: '\\All',
  spamMailbox: '\\Junk',
  flaggedMailbox: '\\Flagged'
};

Mailbox.prototype.isInbox = function() {
  return this.path === 'INBOX';
};

Mailbox.prototype.isSelectable = function() {
  return __indexOf.call(this.attribs || [], '\\Noselect') < 0;
};

Mailbox.prototype.RFC6154use = function() {
  var attribute, field, _ref1;
  _ref1 = Mailbox.RFC6154;
  for (field in _ref1) {
    attribute = _ref1[field];
    if (__indexOf.call(this.attribs, attribute) >= 0) {
      return field;
    }
  }
};

Mailbox.prototype.guessUse = function() {
  var path;
  path = this.path.toLowerCase();
  if (/sent/i.test(path)) {
    return 'sentMailbox';
  } else if (/draft/i.test(path)) {
    return 'draftMailbox';
  } else if (/flagged/i.test(path)) {
    return 'flaggedMailbox';
  } else if (/trash/i.test(path)) {
    return 'trashMailbox';
  }
};

Mailbox.imapcozy_create = function(account, parent, label, callback) {
  var mailbox, path, tree;
  if (parent) {
    path = parent.path + parent.delimiter + label;
    tree = parent.tree.concat(label);
  } else {
    path = label;
    tree = [label];
  }
  mailbox = {
    accountID: account.id,
    label: label,
    path: path,
    tree: tree,
    delimiter: (parent != null ? parent.delimiter : void 0) || '/',
    attribs: []
  };
  return ImapPool.get(account.id).doASAP(function(imap, cbRelease) {
    return imap.addBox(path, cbRelease);
  }, function(err) {
    if (err) {
      return callback(err);
    }
    return Mailbox.create(mailbox, callback);
  });
};

Mailbox.getBoxes = function(accountID, callback) {
  return Mailbox.rawRequest('treeMap', {
    startkey: [accountID],
    endkey: [accountID, {}],
    include_docs: true
  }, function(err, rows) {
    if (err) {
      return callback(err);
    }
    rows = rows.map(function(row) {
      return new Mailbox(row.doc);
    });
    return callback(null, rows);
  });
};

Mailbox.prototype.getSelfAndChildren = function(callback) {
  return Mailbox.rawRequest('treemap', {
    startkey: [this.accountID].concat(this.tree),
    endkey: [this.accountID].concat(this.tree, {}),
    include_docs: true
  }, function(err, rows) {
    if (err) {
      return callback(err);
    }
    rows = rows.map(function(row) {
      return new Mailbox(row.doc);
    });
    return callback(null, rows);
  });
};

Mailbox.destroyByAccount = function(accountID, callback) {
  return Mailbox.rawRequest('treemap', {
    startkey: [accountID],
    endkey: [accountID, {}]
  }, function(err, rows) {
    if (err) {
      return callback(err);
    }
    return async.eachSeries(rows, function(row, cb) {
      return new Mailbox({
        id: row.id
      }).destroy(function(err) {
        if (err) {
          log.error("Fail to delete box", err.stack || err);
        }
        return cb(null);
      });
    }, callback);
  });
};

Mailbox.prototype.imapcozy_rename = function(newLabel, newPath, callback) {
  log.debug("imapcozy_rename", newLabel, newPath);
  return this.imap_rename(newLabel, newPath, (function(_this) {
    return function(err) {
      log.debug("imapcozy_rename err", err);
      if (err) {
        return callback(err);
      }
      return _this.renameWithChildren(newLabel, newPath, function(err) {
        if (err) {
          return callback(err);
        }
        return callback(null);
      });
    };
  })(this));
};

Mailbox.prototype.imap_rename = function(newLabel, newPath, callback) {
  return this.doASAP((function(_this) {
    return function(imap, cbRelease) {
      return imap.renameBox2(_this.path, newPath, cbRelease);
    };
  })(this), callback);
};

Mailbox.prototype.imapcozy_delete = function(account, callback) {
  var box;
  log.debug("imapcozy_delete");
  box = this;
  return async.series([
    (function(_this) {
      return function(cb) {
        return _this.imap_delete(cb);
      };
    })(this), function(cb) {
      log.debug("account.forget");
      return account.forgetBox(box.id, cb);
    }, (function(_this) {
      return function(cb) {
        log.debug("destroyAndRemoveAllMessages");
        return _this.destroyAndRemoveAllMessages(cb);
      };
    })(this)
  ], callback);
};

Mailbox.prototype.imap_delete = function(callback) {
  log.debug("imap_delete");
  return this.doASAP((function(_this) {
    return function(imap, cbRelease) {
      return imap.delBox2(_this.path, cbRelease);
    };
  })(this), callback);
};

Mailbox.prototype.renameWithChildren = function(newLabel, newPath, callback) {
  var depth, path;
  log.debug("renameWithChildren", newLabel, newPath, this.path);
  depth = this.tree.length - 1;
  path = this.path;
  return this.getSelfAndChildren(function(err, boxes) {
    log.debug("imapcozy_rename#boxes", boxes, depth);
    if (err) {
      return callback(err);
    }
    return async.eachSeries(boxes, function(box, cb) {
      var changes, item;
      log.debug("imapcozy_rename#box", box);
      changes = {};
      changes.path = box.path.replace(path, newPath);
      changes.tree = (function() {
        var _i, _len, _ref1, _results;
        _ref1 = box.tree;
        _results = [];
        for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
          item = _ref1[_i];
          _results.push(item);
        }
        return _results;
      })();
      changes.tree[depth] = newLabel;
      if (box.tree.length === depth + 1) {
        changes.label = newLabel;
      }
      return box.updateAttributes(changes, cb);
    }, callback);
  });
};

Mailbox.prototype.destroyAndRemoveAllMessages = function(callback) {
  return this.getSelfAndChildren(function(err, boxes) {
    if (err) {
      return callback(err);
    }
    return async.eachSeries(boxes, function(box, cb) {
      return box.destroy(function(err) {
        if (err) {
          log.error("fail to destroy box " + box.id, err);
        }
        return Message.safeRemoveAllFromBox(box.id, function(err) {
          if (err) {
            log.error("fail to remove msg of box " + box.id, err);
          }
          return cb();
        });
      });
    }, callback);
  });
};

Mailbox.prototype.imap_fetchMails = function(limitByBox, callback) {
  log.debug("imap_fetchMails", limitByBox);
  return this.imap_refreshStep(limitByBox, null, (function(_this) {
    return function(err) {
      var changes;
      log.debug("imap_fetchMailsEnd", limitByBox);
      if (err) {
        return callback(err);
      }
      if (!limitByBox) {
        changes = {
          lastSync: new Date().toISOString()
        };
        return _this.updateAttributes(changes, callback);
      } else {
        return callback(null);
      }
    };
  })(this));
};

computeNextStep = function(laststep, uidnext, limitByBox) {
  var step;
  log.debug("computeNextStep", laststep, uidnext, limitByBox);
  if (laststep == null) {
    laststep = {
      min: uidnext + 1
    };
  }
  if (laststep.min === 1) {
    return false;
  }
  step = {
    max: Math.max(1, laststep.min - 1),
    min: Math.max(1, laststep.min - FETCH_AT_ONCE)
  };
  if (limitByBox) {
    step.min = Math.max(1, laststep.min - limitByBox);
  }
  return step;
};

Mailbox.prototype.getDiff = function(laststep, limit, callback) {
  var box, step;
  log.debug("diff", laststep, limit);
  step = null;
  box = this;
  return this.doLaterWithBox(function(imap, imapbox, cbRelease) {
    if (!(step = computeNextStep(laststep, imapbox.uidnext, limit))) {
      return cbRelease(null);
    }
    log.info("IMAP REFRESH", box.label, "UID " + step.min + ":" + step.max);
    return async.series([
      function(cb) {
        return Message.UIDsInRange(box.id, step.min, step.max, cb);
      }, function(cb) {
        return imap.fetchMetadata(step.min, step.max, cb);
      }
    ], cbRelease);
  }, function(err, results) {
    var cozyFlags, cozyIDs, cozyMessage, flagsChange, id, imapFlags, imapMessage, imapUIDs, toFetch, toRemove, uid;
    log.debug("diff#results");
    if (err) {
      return callback(err);
    }
    if (!results) {
      return callback(null, null);
    }
    cozyIDs = results[0], imapUIDs = results[1];
    toFetch = [];
    toRemove = [];
    flagsChange = [];
    for (uid in imapUIDs) {
      imapMessage = imapUIDs[uid];
      cozyMessage = cozyIDs[uid];
      if (cozyMessage) {
        imapFlags = imapMessage[1];
        cozyFlags = cozyMessage[1];
        if (_.xor(imapFlags, cozyFlags).length) {
          id = cozyMessage[0];
          flagsChange.push({
            id: id,
            flags: imapFlags
          });
        }
      } else {
        toFetch.push({
          uid: parseInt(uid),
          mid: imapMessage[0]
        });
      }
    }
    for (uid in cozyIDs) {
      cozyMessage = cozyIDs[uid];
      if (!imapUIDs[uid]) {
        toRemove.push(id = cozyMessage[0]);
      }
    }
    return callback(null, {
      toFetch: toFetch,
      toRemove: toRemove,
      flagsChange: flagsChange,
      step: step
    });
  });
};

Mailbox.prototype.applyToRemove = function(toRemove, reporter, callback) {
  log.debug("applyRemove", toRemove.length);
  return async.eachSeries(toRemove, (function(_this) {
    return function(id, cb) {
      return Message.removeFromMailbox(id, _this, function(err) {
        if (err) {
          reporter.onError(err);
        }
        reporter.addProgress(1);
        return cb(null);
      });
    };
  })(this), callback);
};

Mailbox.prototype.applyFlagsChanges = function(flagsChange, reporter, callback) {
  log.debug("applyFlagsChange", flagsChange.length);
  return async.eachSeries(flagsChange, function(change, cb) {
    return Message.applyFlagsChanges(change.id, change.flags, function(err) {
      if (err) {
        reporter.onError(err);
      }
      reporter.addProgress(1);
      return cb(null);
    });
  }, callback);
};

Mailbox.prototype.applyToFetch = function(toFetch, reporter, callback) {
  var box;
  log.debug("applyFetch", toFetch.length);
  box = this;
  toFetch.reverse();
  return async.eachSeries(toFetch, function(msg, cb) {
    return Message.fetchOrUpdate(box, msg.mid, msg.uid, function(err) {
      if (err) {
        reporter.onError(err);
      }
      reporter.addProgress(1);
      return cb(null);
    });
  }, callback);
};

Mailbox.prototype.imap_refreshStep = function(limitByBox, laststep, callback) {
  var box;
  log.debug("imap_refreshStep", limitByBox, laststep);
  box = this;
  return this.getDiff(laststep, limitByBox, (function(_this) {
    return function(err, ops) {
      var nbTasks, reporter;
      log.debug("imap_refreshStep#diff", err, ops);
      if (err) {
        return callback(err);
      }
      if (!ops) {
        return callback(null);
      }
      nbTasks = ops.toFetch.length + ops.toRemove.length + ops.flagsChange.length;
      if (nbTasks > 0) {
        reporter = ImapReporter.boxFetch(_this, nbTasks);
      }
      return async.series([
        function(cb) {
          return _this.applyToRemove(ops.toRemove, reporter, cb);
        }, function(cb) {
          return _this.applyFlagsChanges(ops.flagsChange, reporter, cb);
        }, function(cb) {
          return _this.applyToFetch(ops.toFetch, reporter, cb);
        }
      ], function(err) {
        if (reporter != null) {
          reporter.onDone();
        }
        if (limitByBox) {
          return callback(null);
        } else {
          return _this.imap_refreshStep(null, ops.step, callback);
        }
      });
    };
  })(this));
};

Mailbox.prototype.imap_UIDByMessageID = function(messageID, callback) {
  return this.doLaterWithBox(function(imap, imapbox, cb) {
    return imap.search([['HEADER', 'MESSAGE-ID', messageID]], cb);
  }, function(err, uids) {
    return callback(err, uids != null ? uids[0] : void 0);
  });
};

Mailbox.prototype.imap_createMailNoDuplicate = function(account, message, callback) {
  var mailbox, messageID;
  messageID = message.headers['message-id'];
  mailbox = this;
  return this.imap_UIDByMessageID(messageID, function(err, uid) {
    if (err) {
      return callback(err);
    }
    if (uid) {
      return callback(null, uid);
    }
    return account.imap_createMail(mailbox, message, callback);
  });
};

Mailbox.prototype.imap_fetchOneMail = function(uid, callback) {
  return this.doLaterWithBox(function(imap, imapbox, cb) {
    return imap.fetchOneMail(uid, cb);
  }, (function(_this) {
    return function(err, mail) {
      if (err) {
        return callback(err);
      }
      return Message.createFromImapMessage(mail, _this, uid, callback);
    };
  })(this));
};

Mailbox.prototype.imap_removeMail = function(uid, callback) {
  return this.doASAPWithBox(function(imap, imapbox, cbRelease) {
    return async.series([
      function(cb) {
        return imap.addFlags(uid, '\\Deleted', cb);
      }, function(cb) {
        return imap.expunge(uid, cb);
      }, function(cb) {
        return imap.closeBox(cb);
      }
    ], cbRelease);
  }, callback);
};

Mailbox.prototype.recoverChangedUIDValidity = function(imap, callback) {
  var box;
  box = this;
  return imap.openBox(this.path, function(err) {
    if (err) {
      return callback(err);
    }
    return imap.fetchBoxMessageIDs(function(err, messages) {
      var reporter, uids;
      uids = Object.keys(messages);
      reporter = ImapReporter.recoverUIDValidty(box, uids.length);
      return async.eachSeries(uids, function(newUID, cb) {
        var messageID;
        messageID = mailutils.normalizeMessageID(messages[newUID]);
        return Message.recoverChangedUID(box, messageID, newUID, function(err) {
          if (err) {
            reporter.onError(err);
          }
          reporter.addProgress(1);
          return cb(null);
        });
      }, function(err) {
        reporter.onDone();
        return callback(null);
      });
    });
  });
};

Mailbox.prototype.imap_expungeMails = function(callback) {
  var box;
  box = this;
  return this.doASAPWithBox(function(imap, imapbox, cbRelease) {
    return imap.fetchBoxMessageUIDs(function(err, uids) {
      if (err) {
        return cbRelease(err);
      }
      if (uids.length === 0) {
        return cbRelease(null);
      }
      return async.series([
        function(cb) {
          return imap.addFlags(uids, '\\Deleted', cb);
        }, function(cb) {
          return imap.expunge(uids, cb);
        }, function(cb) {
          return imap.closeBox(cb);
        }, function(cb) {
          return Message.safeRemoveAllFromBox(box.id, function(err) {
            if (err) {
              log.error("fail to remove msg of box " + box.id, err);
            }
            return cb();
          });
        }
      ], cbRelease);
    });
  }, callback);
};

Mailbox.removeOrphans = function(existings, callback) {
  log.debug("removeOrphans");
  return Mailbox.rawRequest('treemap', {}, function(err, rows) {
    var boxes;
    if (err) {
      return callback(err);
    }
    boxes = [];
    return async.eachSeries(rows, function(row, cb) {
      var accountID;
      accountID = row.key[0];
      if (__indexOf.call(existings, accountID) >= 0) {
        boxes.push(row.id);
        return cb(null);
      } else {
        log.debug("removeOrphans - found orphan", row.id);
        return new Mailbox({
          id: row.id
        }).destroy(function(err) {
          log.error('failed to delete box', row.id);
          return cb(null);
        });
      }
    }, function(err) {
      return callback(err, boxes);
    });
  });
};

Mailbox.getCounts = function(mailboxID, callback) {
  var options;
  options = mailboxID ? {
    startkey: ['date', mailboxID],
    endkey: ['date', mailboxID, {}]
  } : {
    startkey: ['date', ""],
    endkey: ['date', {}]
  };
  options.reduce = true;
  options.group_level = 3;
  return Message.rawRequest('byMailboxRequest', options, function(err, rows) {
    var result;
    if (err) {
      return callback(err);
    }
    result = {};
    rows.forEach(function(row) {
      var DATEFLAG, boxID, flag, _ref1;
      _ref1 = row.key, DATEFLAG = _ref1[0], boxID = _ref1[1], flag = _ref1[2];
      if (result[boxID] == null) {
        result[boxID] = {
          unread: 0,
          total: 0,
          recent: 0
        };
      }
      if (flag === "!\\Recent") {
        result[boxID].recent = row.recent;
      }
      if (flag === "!\\Seen") {
        return result[boxID].unread = row.value;
      } else if (flag === null) {
        return result[boxID].total = row.value;
      }
    });
    return callback(null, result);
  });
};

Mailbox.prototype.doASAP = function(operation, callback) {
  return ImapPool.get(this.accountID).doASAP(operation, callback);
};

Mailbox.prototype.doASAPWithBox = function(operation, callback) {
  return ImapPool.get(this.accountID).doASAPWithBox(this, operation, callback);
};

Mailbox.prototype.doLaterWithBox = function(operation, callback) {
  return ImapPool.get(this.accountID).doLaterWithBox(this, operation, callback);
};
