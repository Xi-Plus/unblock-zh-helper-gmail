function checkStatus(username, ip) {
  var result = {
    needChecks: false,
    usernameStatus: '',
    usernameRegistration: '',
    usernameBannedDetail: '',
    normalizedUsername: '',
    accountBlocked: false,
    accountBlockBy: '',
    accountBlockReason: '',
    blocked: false,
    isProxyBlocked: false,
    blockBy: '',
    blockReason: '',
    accountHasIpbe: false,
  };

  if (!username && !ip) {
    return result;
  }

  if (username) {
    var payload = {
      action: 'query',
      format: 'json',
      meta: 'globaluserinfo',
      list: 'users',
      usprop: 'cancreate|centralids',
      usattachedwiki: 'zhwiki',
      guiuser: username,
      ususers: username,
    }
    var resp = UrlFetchApp.fetch('https://login.wikimedia.org/w/api.php', {
      'method': 'GET',
      'payload': payload,
      'muteHttpExceptions': true,
    });
    var res = JSON.parse(resp.getContentText('utf-8'));
    console.log('check result 1', JSON.stringify(res));

    var user = res.query.users[0];
    result.normalizedUsername = user.name;
    if (user.userid) {
      if (user.attachedwiki.CentralAuth === '') {
        result.usernameStatus = 'exists';
      } else {
        result.usernameStatus = 'needs_local';
      }
    } else if (user.invalid) {
      result.usernameStatus = 'banned';
    } else if (user.cancreateerror) {
      result.usernameStatus = 'not_exists';
      var cancreateerror = user.cancreateerror[0];
      if (cancreateerror.code === 'userexists') {
        result.usernameStatus = 'needs_local';
      } else if (cancreateerror.code === 'invaliduser') {
        result.usernameStatus = 'banned';
        result.usernameBannedDetail = '使用者名稱無效（電子郵件地址等）。';
      } else if (cancreateerror.code === 'antispoof-name-illegal') {
        result.usernameStatus = 'banned';
        result.usernameBannedDetail = '使用者名稱無效：' + cancreateerror.params[1];
      } else if (cancreateerror.code === '_1') {
        result.usernameStatus = 'banned';
        result.usernameBannedDetail = cancreateerror.params[0]
          .replace('<ul>', ' ')
          .replace(/<\/li><li>/g, '", "')
          .replace(/<\/?li>/g, '"')
          .replace('</ul>', '. ');
      } else if (cancreateerror.code === '_1_2_3') {
        result.usernameStatus = 'banned';
        result.usernameBannedDetail = cancreateerror.params[0] + cancreateerror.params[1] + cancreateerror.params[2];
      } else {
        result.usernameStatus = 'banned';
      }
    } else {
      result.usernameStatus = 'not_exists';
    }
    if (res.query.globaluserinfo && res.query.globaluserinfo.registration) {
      result.usernameRegistration = res.query.globaluserinfo.registration;
    }
  }

  var query = {
    action: 'query',
    list: [],
  }

  if (username) {
    query.list.push('users');
    query.usprop = 'blockinfo|registration|groupmemberships';
    query.ususers = username;
  }
  if (ip) {
    query.list.push('blocks');
    query.bkprop = 'by|reason';
    if (/^#\d+$/.test(ip)) {
      query.bkids = ip.substr(1);
    } else {
      query.list.push('globalblocks');
      query.bkip = ip;
      query.bgprop = 'by|reason';
      query.bgip = ip;
    }
  }

  query.list = query.list.join('|');

  var res = apiRequest('GET', query);
  console.log('check result 2', JSON.stringify(res));

  if (!res.query) {
    return result;
  }

  if (res.query.users) {
    var user = res.query.users[0];

    // account block and ipbe
    if (user.blockid) {
      result.blocked = true;
      result.blockBy = user.blockedby;
      result.blockReason = user.blockreason;
    }
    if (user.groupmemberships) {
      for (var row of user.groupmemberships) {
        if (row.group === 'ipblock-exempt') {
          result.accountHasIpbe = true;
          break;
        }
      }
    }
  }

  // ip block
  if (res.query.blocks && res.query.blocks.length > 0) {
    result.blocked = true;
    result.blockBy = res.query.blocks[0].by;
    result.blockReason = res.query.blocks[0].reason;
  }
  if (res.query.globalblocks && res.query.globalblocks.length > 0) {
    result.blocked = true;
    result.blockBy = res.query.globalblocks[0].by;
    result.blockReason = res.query.globalblocks[0].reason;
  }
  if (/(blocked proxy|open (proxy|proxies))/i.test(result.blockReason)) {
    result.isProxyBlocked = true;
  }

  return result;
}
