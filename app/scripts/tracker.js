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
var locationRequestInProgress = false;
var lastAutomaticLocationRequest = null;

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
  reactiveData.locateOnceOnClick = LocateOnce;
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
  reactiveData.locateOnceDisplay = 'none';
}

function SetUnavailableState() {
  activeSession = null;
  ResetCharacterDetails();
  reactiveData.signInText = 'Retry';
  reactiveData.signInLink = 'javascript:;';
  reactiveData.signInOnClick = RetrySession;
  reactiveData.notifierData = 'Authentication unavailable | ';
  reactiveData.locateOnceDisplay = 'none';
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
  reactiveData.notifierData = radarTrackingEnabled ? 'Tracking... | ' : '';
  reactiveData.locateOnceDisplay = radarTrackingEnabled ? 'none' : '';
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

function FinishLogin(loginAttempt, response) {
  if (loginAttempt != loginAttemptGeneration) {
    return;
  }
  loginInProgress = false;
  var session = NormalizeSession(response);
  if (!session || session.error) {
    syncData();
    return;
  }
  radarTrackingEnabled = true;
  ApplySession(session);
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
      FinishLogin(loginAttempt, response);
    })
    .catch(function() {
      FinishLogin(loginAttempt);
    });
  return false;
}

function LocateOnce(event) {
  if (event && event.preventDefault) {
    event.preventDefault();
  }
  if (radarTrackingEnabled || locationRequestInProgress || activeSession == null) {
    return false;
  }
  FindCharacter(true, activeSession);
  return false;
}

function FindLocation(session, locateOnce, expectedTrackingState) {
  var nextCharacterLocation;
  var nextSystemName;
  var nextRegion;
  var trackingState = expectedTrackingState;
  return SessionUseIsCurrent(session)
    .then(function(isCurrent) {
      if (!isCurrent || radarTrackingEnabled != trackingState) {
        throw {error: 'stale'};
      }
      if (!locateOnce) {
        var now = Date.now();
        if (lastAutomaticLocationRequest != null &&
            now - lastAutomaticLocationRequest < 5000) {
          throw {error: 'too_soon'};
        }
        lastAutomaticLocationRequest = now;
      }
      return axios({
        method: 'get',
        url: 'https://esi.evetech.net/latest/characters/'+session.characterID+'/location/?language=en',
        headers: {Authorization: 'Bearer '+session.token}
      });
    })
    .then(function(response) {
      nextCharacterLocation = response.data.solar_system_id;
      return SessionUseIsCurrent(session).then(function(isCurrent) {
        if (!isCurrent) {
          throw {error: 'stale'};
        }
        if (!locateOnce && locationStateSession != null &&
            SessionIdentityMatches(locationStateSession, session) &&
            characterLocation == nextCharacterLocation) {
          throw 'no update';
        }
        return axios({
          method: 'get',
          url: 'https://esi.evetech.net/latest/universe/systems/'+nextCharacterLocation+'/?language=en'
        });
      });
    })
    .then(function(response) {
      nextSystemName = response.data.name.replace(/ /gi, '_');
      return axios({
        method: 'get',
        url: 'https://esi.evetech.net/latest/universe/constellations/'+response.data.constellation_id+'/?language=en'
      });
    })
    .then(function(response) {
      return axios({
        method: 'get',
        url: 'https://esi.evetech.net/latest/universe/regions/'+response.data.region_id+'/?language=en'
      });
    })
    .then(function(response) {
      return SessionUseIsCurrent(session).then(function(isCurrent) {
        if (!isCurrent || radarTrackingEnabled != trackingState) {
          throw {error: 'stale'};
        }
        nextRegion = response.data.name.replace(/ /gi, '_');
        return ChangePage(nextRegion, nextSystemName, nextCharacterLocation,
          trackingState, session, ExistingWaypointString(nextSystemName))
          .then(function(accepted) {
            if (!accepted) {
              throw {error: 'stale'};
            }
            characterLocation = nextCharacterLocation;
            systemName = nextSystemName;
            region = nextRegion;
            locationStateSession = session;
            reactiveData.characterLocation = systemName+', '+region;
          });
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

function FindCharacter(locateOnce, expectedSession) {
  if (locationRequestInProgress) {
    return Promise.resolve();
  }
  var expectedTrackingState = radarTrackingEnabled;
  locationRequestInProgress = true;
  var sessionRequest = expectedSession == null ? syncData() : RequestSession(expectedSession);
  return sessionRequest.then(function(session) {
    if (!session || session.error ||
        (locateOnce ? radarTrackingEnabled : !radarTrackingEnabled) ||
        radarTrackingEnabled != expectedTrackingState) {
      return;
    }
    if (expectedSession != null && !SessionIdentityMatches(expectedSession, session)) {
      return;
    }
    if (!locateOnce && reactiveData.trackingTriggerText == 'Start Tracking') {
      radarTrackingTrigger();
    }
    return FindLocation(session, !!locateOnce, expectedTrackingState);
  }).catch(function(error) {
    if (error && error.error == 'unavailable') {
      SetUnavailableState();
    }
  }).then(function(result) {
    locationRequestInProgress = false;
    return result;
  }, function() {
    locationRequestInProgress = false;
  });
}

function LocationStateIsCurrent(session) {
  return locationStateSession != null && SessionIdentityMatches(locationStateSession, session) &&
    characterLocation != null && typeof systemName == 'string' && systemName.length > 0 &&
    typeof region == 'string' && region.length > 0;
}

function CurrentMapContainsSystem(mapObject, systemID) {
  try {
    return mapObject.contentDocument != null &&
      mapObject.contentDocument.getElementById('sys'+systemID) != null;
  }
  catch (error) {
    return false;
  }
}

function SelectMapName(systemID, fallbackRegion) {
  var match = window.location.pathname.match(/^\/map\/([^/]+)/);
  var currentMapName = match == null ? null : match[1];
  var mapObject = document.getElementById('map');
  if (currentMapName == null || mapObject == null) {
    return Promise.resolve(fallbackRegion);
  }
  if (CurrentMapContainsSystem(mapObject, systemID)) {
    return Promise.resolve(currentMapName);
  }
  try {
    if ((mapObject.contentDocument != null &&
         mapObject.contentDocument.readyState != 'loading') ||
        typeof mapObject.addEventListener != 'function') {
      return Promise.resolve(fallbackRegion);
    }
  }
  catch (error) {
    return Promise.resolve(fallbackRegion);
  }
  return new Promise(function(resolve) {
    var settled = false;
    var finish = function() {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      mapObject.removeEventListener('load', finish);
      resolve(CurrentMapContainsSystem(mapObject, systemID) ? currentMapName : fallbackRegion);
    };
    var timeout = setTimeout(finish, 1000);
    mapObject.addEventListener('load', finish);
  });
}

function ExistingWaypointString(mapSystemName) {
  var i = 1;
  var waypointArray = window.location.pathname.split('#')[0].split(':');
  if (mapSystemName == waypointArray[1]) {
    i += 1;
  }
  var waypointString = '';
  for (; i < waypointArray.length; i++) {
    waypointString += ':' + waypointArray[i];
  }
  return waypointString;
}

function ChangePage(mapRegion, mapSystemName, systemID, trackingState, session, waypointString) {
  return SelectMapName(systemID, mapRegion).then(function(mapName) {
    return SessionUseIsCurrent(session).then(function(isCurrent) {
      if (!isCurrent || radarTrackingEnabled != trackingState) {
        return false;
      }
      var trackingQuery = trackingState ? '?tracking' : '';
      var url = 'https://evemaps.dotlan.net/map/'+mapName+'/'+mapSystemName+
        waypointString+trackingQuery+window.location.hash;
      if (window.location.href != url) {
        window.location.assign(url);
      }
      return true;
    });
  });
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
  var finishLogout = function(response) {
    if (generation != loginAttemptGeneration) {
      return;
    }
    logoutInProgress = false;
    if (response && !response.error && response.ok === true) {
      SetSignedOutStateTopbar();
    }
    else {
      SetUnavailableState();
    }
  };
  BackgroundMessage({
    contentScriptQuery: 'logout',
    expectedToken: expected.token,
    expectedSessionId: expected.sessionId
  }).then(finishLogout, finishLogout);
  return false;
}

function radarTrackingTrigger() {
  if (reactiveData.trackingTriggerText == 'Stop Tracking') {
    reactiveData.trackingTriggerText = 'Start Tracking';
    reactiveData.notifierData = '';
    reactiveData.locateOnceDisplay = '';
    reactiveData.topbarContainerAnimation = 'slideIn 1s ease-out 0.5s 1 forwards';
    reactiveData.topbarContainerAnimationModifier = 'slideIn 1s ease-out 0.5s 1 forwards';
    radarTrackingEnabled = false;
  }
  else {
    reactiveData.trackingTriggerText = 'Stop Tracking';
    reactiveData.notifierData = 'Tracking... | ';
    reactiveData.locateOnceDisplay = 'none';
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
}

function StartHeartbeat() {
  if (characterHeartbeat == null) {
    characterHeartbeat = setInterval(FindCharacter, 5000);
  }
}

// 'main'
reactiveData.signInLink = 'javascript:;';
reactiveData.signInOnClick = StartLogin;
reactiveData.trackingTriggerFunction = radarTrackingTrigger;

InitializeTrackingFromLocation();
syncData().then(StartHeartbeat, StartHeartbeat);
