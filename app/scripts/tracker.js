var BACKGROUND_MESSAGE_TIMEOUT_MS = 6000;

var activeSession = null;
var loginInProgress = false;
var loginAttemptGeneration = 0;
var radarTrackingEnabled = false;
var characterID = null;
var characterLocation = null;
var systemName = null;
var region = null;
var locationStateSession = null;
var characterHeartbeat = null;
var logoutInProgress = false;

function BackgroundMessage(request) {
  return new Promise(function(resolve, reject) {
    var settled = false;
    var timeout = request.contentScriptQuery == 'startAuth' ? null : setTimeout(function() {
      if (!settled) {
        settled = true;
        reject({error: 'unavailable'});
      }
    }, BACKGROUND_MESSAGE_TIMEOUT_MS);
    var finish = function(callback, value) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    try {
      chrome.runtime.sendMessage(request, function(response) {
        var lastError = chrome.runtime.lastError;
        if (lastError) {
          finish(reject, {error: 'unavailable'});
          return;
        }
        finish(resolve, response || {error: 'unavailable'});
      });
    }
    catch (error) {
      finish(reject, {error: 'unavailable'});
    }
  });
}

function SessionIdentityMatches(first, second) {
  return first != null && second != null && first.token === second.token &&
    first.sessionId === second.sessionId;
}

function NormalizeSession(response) {
  if (!response || response.error) {
    return response;
  }
  if (typeof response.token != 'string' || response.token.length == 0 ||
      typeof response.characterID != 'string' || !/^[0-9]+$/.test(response.characterID) ||
      typeof response.characterName != 'string' || response.characterName.trim().length == 0 ||
      typeof response.exp != 'number' || !isFinite(response.exp) ||
      response.exp <= Date.now() / 1000 ||
      (typeof response.sessionId != 'number' && typeof response.sessionId != 'string')) {
    return {error: 'invalid_token'};
  }
  return {
    token: response.token,
    characterID: response.characterID,
    characterName: response.characterName,
    exp: response.exp,
    sessionId: response.sessionId
  };
}

function ResetCharacterDetails() {
  characterID = null;
  characterLocation = null;
  systemName = null;
  region = null;
  locationStateSession = null;
  reactiveData.characterName = 'No character logged in';
  reactiveData.charLocationDisplay = 'none';
  reactiveData.notifierDisplay = 'none';
  reactiveData.characterPortrait = '';
  reactiveData.characterLocation = '';
}

function SetSignedInStateTopbar() {
  reactiveData.signInText = 'Sign Out';
  reactiveData.signInOnClick = RevokeToken;
  reactiveData.signInLink = 'javascript:;';
}

function SetSignedOutStateTopbar() {
  activeSession = null;
  ResetCharacterDetails();
  if (reactiveData.trackingTriggerText == 'Stop Tracking') {
    radarTrackingTrigger();
  }
  reactiveData.signInText = 'Sign in';
  reactiveData.signInLink = 'javascript:;';
  reactiveData.signInOnClick = StartLogin;
  reactiveData.signInRole = '';
}

function SetUnavailableState() {
  activeSession = null;
  ResetCharacterDetails();
  reactiveData.signInText = 'Retry';
  reactiveData.signInLink = 'javascript:;';
  reactiveData.signInOnClick = RetrySession;
  reactiveData.notifierData = 'Authentication unavailable | ';
}

function RetrySession(event) {
  if (event && event.preventDefault) {
    event.preventDefault();
  }
  syncData();
  return false;
}

function GetSessionSnapshot() {
  return activeSession;
}

function RequestSession(expected) {
  var request = {contentScriptQuery: 'getSession'};
  if (expected != null) {
    request.expectedToken = expected.token;
    request.expectedSessionId = expected.sessionId;
  }
  return BackgroundMessage(request).then(function(response) {
    return NormalizeSession(response);
  });
}

function SessionUseIsCurrent(session) {
  if (!session || typeof session.token != 'string' ||
      session.exp <= Date.now() / 1000) {
    return Promise.resolve(false);
  }
  return RequestSession(session).then(function(current) {
    return !!current && !current.error && SessionIdentityMatches(session, current) &&
      current.exp > Date.now() / 1000;
  }).catch(function() {
    return false;
  });
}

function ApplySession(session) {
  if (activeSession != null && !SessionIdentityMatches(activeSession, session)) {
    ResetCharacterDetails();
  }
  activeSession = session;
  characterID = session.characterID;
  reactiveData.characterName = session.characterName;
  reactiveData.charLocationDisplay = '';
  reactiveData.notifierDisplay = '';
  reactiveData.topbarContainerAnimation = 'none';
  reactiveData.topbarContainerAnimationModifier = 'none';
  reactiveData.trackingTriggerText = radarTrackingEnabled ? 'Stop Tracking' : 'Start Tracking';
  reactiveData.notifierData = radarTrackingEnabled ? 'Tracking... | ' : 'Not Tracking | ';
  reactiveData.characterPortrait = 'https://image.eveonline.com/Character/'+characterID+'_32.jpg';
  SetSignedInStateTopbar();
}

function syncData() {
  var generation = loginAttemptGeneration;
  if (logoutInProgress) {
    return Promise.resolve(null);
  }
  return RequestSession().then(function(session) {
    if (logoutInProgress || generation != loginAttemptGeneration) {
      return null;
    }
    if (!session || session.error) {
      if (session && session.error == 'unavailable') {
        SetUnavailableState();
      }
      else if (session && (session.error == 'signed_out' || session.error == 'invalid_token')) {
        SetSignedOutStateTopbar();
      }
      return null;
    }
    if (session.exp <= Date.now() / 1000) {
      SetUnavailableState();
      return null;
    }
    ApplySession(session);
    return session;
  }).catch(function() {
    if (generation == loginAttemptGeneration) {
      SetUnavailableState();
    }
    return null;
  });
}

function RestoreLoginState(loginAttempt) {
  if (loginAttempt != loginAttemptGeneration) {
    return Promise.resolve();
  }
  return syncData();
}

function StartLogin(event) {
  if (!event || event.isTrusted !== true) {
    if (event && event.preventDefault) {
      event.preventDefault();
    }
    return false;
  }
  if (event.preventDefault) {
    event.preventDefault();
  }
  if (loginInProgress || logoutInProgress) {
    return false;
  }
  var loginAttempt = ++loginAttemptGeneration;
  loginInProgress = true;
  reactiveData.signInText = 'Signing in...';
  BackgroundMessage({contentScriptQuery: 'startAuth'})
    .then(function(response) {
      if (loginAttempt != loginAttemptGeneration) {
        return;
      }
      loginInProgress = false;
      var session = NormalizeSession(response);
      if (!session || session.error) {
        RestoreLoginState(loginAttempt);
        return;
      }
      radarTrackingEnabled = true;
      ApplySession(session);
    })
    .catch(function() {
      if (loginAttempt != loginAttemptGeneration) {
        return;
      }
      loginInProgress = false;
      RestoreLoginState(loginAttempt);
    });
  return false;
}

function GetCharacterID() {
  var generation = loginAttemptGeneration;
  var expected = activeSession;
  return RequestSession(expected).then(function(session) {
    if (generation != loginAttemptGeneration) {
      throw {error: 'stale'};
    }
    if (!session || session.error) {
      throw session || {error: 'unavailable'};
    }
    if (expected != null && !SessionIdentityMatches(expected, session)) {
      throw {error: 'stale'};
    }
    if (session.exp <= Date.now() / 1000) {
      throw {error: 'invalid_token'};
    }
    ApplySession(session);
    return session;
  });
}

function FindLocation(session) {
  return SessionUseIsCurrent(session)
    .then(function(isCurrent) {
      if (!isCurrent) {
        throw {error: 'stale'};
      }
      return axios({
        method: 'get',
        url: 'https://esi.evetech.net/latest/characters/'+session.characterID+'/location/?language=en',
        headers: {Authorization: 'Bearer '+session.token}
      });
    })
    .then(function(response) {
      return SessionUseIsCurrent(session).then(function(isCurrent) {
        if (!isCurrent) {
          throw {error: 'stale'};
        }
        if (locationStateSession != null &&
            SessionIdentityMatches(locationStateSession, session) &&
            characterLocation == response.data.solar_system_id) {
          throw 'no update';
        }
        characterLocation = response.data.solar_system_id;
        return axios({
          method: 'get',
          url: 'https://esi.evetech.net/latest/universe/systems/'+response.data.solar_system_id+'/?language=en'
        });
      });
    })
    .then(function(response) {
      return SessionUseIsCurrent(session).then(function(isCurrent) {
        if (!isCurrent) {
          throw {error: 'stale'};
        }
        systemName = response.data.name.replace(/ /gi, '_');
        return axios({
          method: 'get',
          url: 'https://esi.evetech.net/latest/universe/constellations/'+response.data.constellation_id+'/?language=en'
        });
      });
    })
    .then(function(response) {
      return SessionUseIsCurrent(session).then(function(isCurrent) {
        if (!isCurrent) {
          throw {error: 'stale'};
        }
        return axios({
          method: 'get',
          url: 'https://esi.evetech.net/latest/universe/regions/'+response.data.region_id+'/?language=en'
        });
      });
    })
    .then(function(response) {
      return SessionUseIsCurrent(session).then(function(isCurrent) {
        if (!isCurrent) {
          throw {error: 'stale'};
        }
        region = response.data.name.replace(/ /gi, '_');
        locationStateSession = session;
        reactiveData.characterLocation = systemName+', '+region;
        if (location.pathname.split('#')[0] != '/map/'+region+'/'+systemName &&
            location.pathname.split(':')[0] != '/map/'+region+'/'+systemName) {
          ChangePage(region, systemName);
        }
      });
    })
    .catch(function(error) {
      if (error == 'no update' || (error && error.error == 'stale')) {
        return;
      }
      return SessionUseIsCurrent(session).then(function(isCurrent) {
        if (isCurrent && error && error.error == 'unavailable') {
          SetUnavailableState();
        }
      }).catch(function() {});
    });
}

function FindCharacter() {
  return syncData().then(function(session) {
    if (!session || !radarTrackingEnabled) {
      return;
    }
    if (reactiveData.trackingTriggerText == 'Start Tracking') {
      radarTrackingTrigger();
    }
    return FindLocation(session);
  }).catch(function(error) {
    if (error && error.error == 'unavailable') {
      SetUnavailableState();
    }
  });
}

function LocationStateIsCurrent(session) {
  return locationStateSession != null && SessionIdentityMatches(locationStateSession, session) &&
    characterLocation != null && typeof systemName == 'string' && systemName.length > 0 &&
    typeof region == 'string' && region.length > 0;
}

function ChangePage(mapRegion, mapSystemName) {
  var i = 1;
  var waypointArray = window.location.pathname.split('#')[0].split(':');
  var hash = window.location.hash;
  if (mapSystemName == waypointArray[1]) {
    i += 1;
  }
  var waypointString = '';
  for (; i < waypointArray.length; i++) {
    waypointString += ':' + waypointArray[i];
  }
  location.href = 'https://evemaps.dotlan.net/map/'+mapRegion+'/'+mapSystemName+waypointString+'?tracking'+hash;
}

function RevokeToken() {
  var expected = activeSession;
  var generation = ++loginAttemptGeneration;
  loginInProgress = false;
  logoutInProgress = true;
  activeSession = null;
  ResetCharacterDetails();
  if (reactiveData.trackingTriggerText == 'Stop Tracking') {
    radarTrackingTrigger();
  }
  reactiveData.signInText = 'Signing out...';
  reactiveData.signInLink = 'javascript:;';
  reactiveData.signInOnClick = function() { return false; };
  if (expected == null) {
    logoutInProgress = false;
    SetSignedOutStateTopbar();
    return false;
  }
  BackgroundMessage({
    contentScriptQuery: 'logout',
    expectedToken: expected.token,
    expectedSessionId: expected.sessionId
  }).then(function(response) {
    if (generation != loginAttemptGeneration) {
      return;
    }
    if (!response || response.error || response.ok !== true) {
      logoutInProgress = false;
      SetUnavailableState();
      return;
    }
    logoutInProgress = false;
    SetSignedOutStateTopbar();
  }).catch(function() {
    if (generation == loginAttemptGeneration) {
      logoutInProgress = false;
      SetUnavailableState();
    }
  });
  return false;
}

function radarTrackingTrigger() {
  if (reactiveData.trackingTriggerText == 'Stop Tracking') {
    reactiveData.trackingTriggerText = 'Start Tracking';
    reactiveData.notifierData = 'Not Tracking | ';
    reactiveData.topbarContainerAnimation = 'slideIn 1s ease-out 0.5s 1 forwards';
    reactiveData.topbarContainerAnimationModifier = 'slideIn 1s ease-out 0.5s 1 forwards';
    radarTrackingEnabled = false;
  }
  else {
    reactiveData.trackingTriggerText = 'Stop Tracking';
    reactiveData.notifierData = 'Tracking... | ';
    reactiveData.topbarContainerAnimation = 'none';
    reactiveData.topbarContainerAnimationModifier = 'none';
    radarTrackingEnabled = true;
  }
}

function InitializeTrackingFromLocation() {
  var queryParameters = new URLSearchParams(window.location.search);
  if (queryParameters.has('tracking')) {
    radarTrackingEnabled = true;
  }
  return Promise.resolve();
}

function StartHeartbeat() {
  if (characterHeartbeat == null) {
    characterHeartbeat = setInterval(FindCharacter, 1000);
  }
}

// 'main'
reactiveData.signInLink = 'javascript:;';
reactiveData.signInOnClick = StartLogin;
reactiveData.trackingTriggerFunction = radarTrackingTrigger;

InitializeTrackingFromLocation()
  .then(function() {
    return FindCharacter();
  })
  .then(function() {
    StartHeartbeat();
  })
  .catch(function() {
    StartHeartbeat();
  });
