
var ESI_CLIENT_ID = 'f7b4d46e9ec2494481e8a40fd860540a';

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
  if (loginInProgress) {
    return false;
  }
  var loginAttempt = ++loginAttemptGeneration;
  loginInProgress = true;
  reactiveData.signInText = 'Signing in...';
  try {
    chrome.runtime.sendMessage(
      {contentScriptQuery: 'startAuth'},
      response => {
        var lastError = chrome.runtime.lastError;
        if (loginAttempt != loginAttemptGeneration) {
          return;
        }
        loginInProgress = false;
        if (lastError || !response || response.error) {
          console.log('Authentication flow failed');
          RestoreLoginState(loginAttempt);
          return;
        }
        syncData()
        .then( () => {
          if (loginAttempt != loginAttemptGeneration) {
            throw {error: 'stale'};
          }
          if (token == null || refreshToken == null || credentialClientId != ESI_CLIENT_ID) {
            throw {error: 'transient'};
          }
          radarTrackingEnabled = true;
          initializationPending = true;
          reactiveData.signInText = 'Sign Out';
          reactiveData.signInOnClick = RevokeToken;
          reactiveData.signInLink = 'javascript:;';
        })
        .catch( () => {
          if (loginAttempt != loginAttemptGeneration) {
            return;
          }
          console.log('Authentication setup failed');
          RestoreLoginState(loginAttempt);
        });
      }
    );
  }
  catch (error) {
    loginInProgress = false;
    if (loginAttempt != loginAttemptGeneration) {
      return false;
    }
    console.log('Authentication flow failed');
    RestoreLoginState(loginAttempt);
  }
  return false;
}

function SetSignedInStateTopbar() {
  reactiveData.signInText = 'Sign Out';
  reactiveData.signInOnClick = RevokeToken;
  reactiveData.signInLink = 'javascript:;';
}

function SetSignedOutStateTopbar() {
  verifiedSessionCache = null;
  verifiedSessionPromise = null;
  sessionRecoveryPromise = null;
  reactiveData.signInText = 'Sign in';
  reactiveData.signInLink = 'javascript:;';
  reactiveData.signInOnClick = StartLogin;
  reactiveData.signInRole = '';
  reactiveData.characterName = 'No character logged in';
  reactiveData.charLocationDisplay = 'none';
  reactiveData.notifierDisplay = 'none';
  reactiveData.topbarContainerAnimation = 'slideIn 1s ease-out 0.5s 1 forwards';
  reactiveData.topbarContainerAnimationModifier = 'slideIn 1s ease-out 0.5s 1 forwards';
  reactiveData.characterPortrait = '';
  if (reactiveData.trackingTriggerText == 'Stop Tracking') {
    radarTrackingTrigger();
  }
  characterID = null;
  token = null;
  refreshToken = null;
  credentialClientId = null;
}

function GetSessionSnapshot() {
  return {
    token: token,
    refreshToken: refreshToken,
    clientId: credentialClientId
  };
}

function SessionsMatch(first, second) {
  return first != null && second != null && first.token === second.token &&
    first.refreshToken === second.refreshToken && first.clientId === second.clientId;
}

function ResetCharacterDetails() {
  characterID = null;
  reactiveData.characterName = 'No character logged in';
  reactiveData.charLocationDisplay = 'none';
  reactiveData.notifierDisplay = 'none';
  reactiveData.characterPortrait = '';
  reactiveData.characterLocation = '';
}

function SessionIsCurrent(session) {
  if (!SessionsMatch(session, GetSessionSnapshot())) {
    return Promise.resolve(false);
  }
  return localGet_Promise(['radarToken', 'radarRefreshToken', 'radarClientId'])
    .then(function(items) {
      var storedSession = {
        token: (typeof items.radarToken == 'undefined') ? null : items.radarToken,
        refreshToken: (typeof items.radarRefreshToken == 'undefined') ? null : items.radarRefreshToken,
        clientId: (typeof items.radarClientId == 'undefined') ? null : items.radarClientId
      };
      if (!SessionsMatch(session, storedSession) || !SessionsMatch(session, GetSessionSnapshot())) {
        return false;
      }
      return CredentialInvalidationExists(session).then(function(invalidated) {
        return !invalidated && SessionsMatch(session, GetSessionSnapshot());
      });
    });
}

function SessionUseIsCurrent(session) {
  var currentSession = session && session.session ? session.session : session;
  var expiration = session && session.session ? session.exp : session && session.exp;
  if (!currentSession || typeof currentSession.token != 'string' || currentSession.token.length == 0 ||
      typeof currentSession.refreshToken != 'string' || currentSession.refreshToken.length == 0 ||
      currentSession.clientId !== ESI_CLIENT_ID || typeof expiration != 'number' ||
      !isFinite(expiration) || expiration <= Date.now() / 1000) {
    return Promise.resolve(false);
  }
  return SessionIsCurrent(currentSession);
}

function GetVerifiedSessionFor(session) {
  if (!session || typeof session.token != 'string' || session.token.length == 0 ||
      typeof session.refreshToken != 'string' || session.refreshToken.length == 0 ||
      session.clientId !== ESI_CLIENT_ID) {
    return Promise.reject({error: 'invalid_token'});
  }
  if (verifiedSessionCache != null && SessionsMatch(verifiedSessionCache.session, session)) {
    return SessionIsCurrent(session).then(function(isCurrent) {
      if (!isCurrent) {
        throw {error: 'stale'};
      }
      if (verifiedSessionCache.expiresAt > Date.now() &&
          verifiedSessionCache.exp > Date.now() / 1000) {
        return verifiedSessionCache;
      }
      verifiedSessionCache = null;
      return GetVerifiedSessionFor(session);
    });
  }
  if (verifiedSessionPromise != null && SessionsMatch(verifiedSessionPromise.session, session)) {
    return verifiedSessionPromise.promise;
  }
  var pending = {
    session: session,
    promise: null
  };
  var request = SessionIsCurrent(session)
    .then(function(isCurrent) {
      if (!isCurrent) {
        throw {error: 'stale'};
      }
      return CredentialMessage_Promise({
        contentScriptQuery: 'verifyToken',
        token: session.token,
        refreshToken: session.refreshToken,
        clientId: session.clientId
      });
    })
    .then(function(response) {
      if (!response || response.error) {
        throw response && response.error ? {error: response.error} : {error: 'transient'};
      }
      if (typeof response.characterID != 'string' || !/^[0-9]+$/.test(response.characterID) ||
          typeof response.characterName != 'string' || response.characterName.trim().length == 0 ||
          typeof response.exp != 'number' || !isFinite(response.exp)) {
        throw {error: 'invalid_token'};
      }
      return SessionIsCurrent(session).then(function(isCurrent) {
        if (!isCurrent || response.exp <= Date.now() / 1000) {
          throw {error: isCurrent ? 'invalid_token' : 'stale'};
        }
        return {
          session: session,
          characterID: response.characterID,
          characterName: response.characterName,
          exp: response.exp,
          expiresAt: Math.min(response.exp * 1000, Date.now() + 5000)
        };
      });
    });
  pending.promise = request.then(function(result) {
    if (verifiedSessionPromise === pending) {
      verifiedSessionPromise = null;
    }
    verifiedSessionCache = result;
    return result;
  }, function(error) {
    if (verifiedSessionPromise === pending) {
      verifiedSessionPromise = null;
    }
    throw error && error.error ? error : {error: 'transient'};
  });
  verifiedSessionPromise = pending;
  return pending.promise;
}

function ClearInvalidSessionIfCurrent(session) {
  return SessionIsCurrent(session).then(function(isCurrent) {
    if (!isCurrent) {
      throw {error: 'stale'};
    }
    SetLogoutStateTopbar(session);
    throw {error: 'invalid_token'};
  });
}

function RestoreLoginState(loginAttempt) {
  if (loginAttempt != loginAttemptGeneration) {
    return;
  }
  syncData()
    .then(function() {
      if (loginAttempt != loginAttemptGeneration) {
        return;
      }
      if (token != null && refreshToken != null && credentialClientId == ESI_CLIENT_ID) {
        SetSignedInStateTopbar();
      }
      else {
        SetSignedOutStateTopbar();
      }
    })
    .catch(function() {
      if (loginAttempt == loginAttemptGeneration) {
        SetSignedOutStateTopbar();
      }
    });
}

/*
 * attempts to get character information by verifying our token
 * if the token is good, the information in the topbar is set
 * if it's bad, we try to refresh the token
 */
function GetCharacterID(allowRefresh) {
  if (typeof allowRefresh == 'undefined') {
    allowRefresh = true;
  }
  var requestedSession = GetSessionSnapshot();
  return GetVerifiedSessionFor(requestedSession)
    .then(function(verified) {
      return SessionIsCurrent(requestedSession).then(function(isCurrent) {
        if (!isCurrent || !SessionsMatch(requestedSession, GetSessionSnapshot())) {
          throw {error: 'stale'};
        }
        characterID = verified.characterID;
        reactiveData.characterName = verified.characterName;
        reactiveData.charLocationDisplay = '';
        reactiveData.notifierDisplay = '';
        reactiveData.topbarContainerAnimation = 'none';
        reactiveData.topbarContainerAnimationModifier = 'none';
        reactiveData.notifierData = 'Tracking... | ';
        reactiveData.characterPortrait = 'https://image.eveonline.com/Character/'+characterID+'_32.jpg';
        SetSignedInStateTopbar();
        return verified;
      });
    })
    .catch(function(error) {
      var errorType = error && error.error;
      if (errorType == 'stale' || errorType == 'transient') {
        throw error;
      }
      if (errorType == 'invalid_token' && allowRefresh &&
          requestedSession.refreshToken != null && requestedSession.clientId === ESI_CLIENT_ID) {
        return SessionIsCurrent(requestedSession).then(function(isCurrent) {
          if (!isCurrent) {
            throw {error: 'stale'};
          }
          if (sessionRecoveryPromise != null &&
              SessionsMatch(sessionRecoveryPromise.session, requestedSession)) {
            return sessionRecoveryPromise.promise.then(function() {
              return GetCharacterID(false);
            });
          }
          var recovery = {
            session: requestedSession,
            promise: null
          };
          recovery.promise = AttemptRefreshToken(requestedSession.refreshToken)
            .then(function() {
              if (sessionRecoveryPromise === recovery) {
                sessionRecoveryPromise = null;
              }
              return GetCharacterID(false);
            }, function(recoveryError) {
              if (sessionRecoveryPromise === recovery) {
                sessionRecoveryPromise = null;
              }
              throw recoveryError;
            });
          sessionRecoveryPromise = recovery;
          return recovery.promise;
        });
      }
      if (errorType == 'invalid_token') {
        return ClearInvalidSessionIfCurrent(requestedSession);
      }
      throw {error: 'transient'};
    });
}

/*
 * This is the logic that runs once a second.
 * First we check to see if we should be tracking at all
 * If another tab starts/stops tracking or logs in/out, the logic at the top will pick that up
 * 
 * Then we get the character location from ESI and update if necessary
 * 
 * If the calls fail, we try to find a new token, or refresh tokens for a new one
 */
function FindCharacter() {
  var initializing = false;
  var locationSession = null;
  return syncData()
  .then( () => {
    if (initializationPending && !initializationInProgress && refreshToken != null) {
      initializing = true;
      initializationInProgress = true;
      return (token == null ? AttemptRefreshToken(refreshToken) : Promise.resolve())
      .then( () => {
        reactiveData.signInText = 'Sign Out';
        reactiveData.signInOnClick = RevokeToken;
        reactiveData.signInLink = 'javascript:;';
        return GetCharacterID();
      })
      .then( () => {
        if (!radarTrackingEnabled) {
          reactiveData.notifierData = 'Not Tracking | ';
        }
        initializationPending = false;
        initializationInProgress = false;
      })
      .catch( (error) => {
        initializationInProgress = false;
        if (error && error.error == 'transient') {
          initializationPending = true;
        }
        throw error;
      });
    }
    if (initializationInProgress) {
      throw 'tracking stopped';
    }
    if (refreshToken == null && characterID != null) {
      SetLogoutStateTopbar();
    }
    else if (refreshToken == null && characterID == null) {
      throw 'tracking stopped';
    }
    else if (characterID != null) {
      reactiveData.signInText = 'Sign Out';
      reactiveData.signInOnClick = RevokeToken;
      reactiveData.signInLink = 'javascript:;';
    }
    if (!radarTrackingEnabled){
      if (reactiveData.trackingTriggerText == 'Stop Tracking') {
        radarTrackingTrigger();
      }
      throw 'tracking stopped';
    }
    else {
      if (reactiveData.trackingTriggerText == 'Start Tracking') {
        radarTrackingTrigger();
      }
      if (characterID == null) {
        return GetCharacterID(true).then(function(verified) {
          locationSession = verified;
        });
      }
      return GetCharacterID(true).then(function(verified) {
        locationSession = verified;
      });
    }
  })
  .then( () => {
    if (initializing) {
      return;
    }
    if (locationSession == null) {
      throw {error: 'stale'};
    }
    return SessionUseIsCurrent(locationSession).then(function(isCurrent) {
      if (!isCurrent || characterID != locationSession.characterID) {
        throw {error: 'stale'};
      }
      return axios({
        method: 'get',
        url: 'https://esi.evetech.net/latest/characters/'+locationSession.characterID+'/location/?language=en',
        headers: {Authorization: 'Bearer '+locationSession.session.token}
      });
    });
  })
  .then( (response) => {
    if (initializing) {
      return;
    }
    return SessionUseIsCurrent(locationSession).then(function(isCurrent) {
      if (!isCurrent || characterID != locationSession.characterID) {
        throw {error: 'stale'};
      }
      if (characterLocation == response.data['solar_system_id']) {throw 'no update';}
      characterLocation = response.data['solar_system_id'];
      return axios({
        method: 'get',
        url: 'https://esi.evetech.net/latest/universe/systems/'+response.data['solar_system_id']+'/?language=en'
      });
    });
  })
  .then( (response) => {
    if (initializing) {
      return;
    }
    return SessionUseIsCurrent(locationSession).then(function(isCurrent) {
      if (!isCurrent || characterID != locationSession.characterID) {
        throw {error: 'stale'};
      }
      systemName = response.data['name'].replace(/ /gi, '_');
      return axios({
        method: 'get',
        url: 'https://esi.evetech.net/latest/universe/constellations/'+response.data['constellation_id']+'/?language=en'
      });
    });
  })
  .then( (response) => {
    if (initializing) {
      return;
    }
    return SessionUseIsCurrent(locationSession).then(function(isCurrent) {
      if (!isCurrent || characterID != locationSession.characterID) {
        throw {error: 'stale'};
      }
      return axios({
        method: 'get',
        url: 'https://esi.evetech.net/latest/universe/regions/'+response.data['region_id']+'/?language=en'
      });
    });
  })
  .then( (response) => {
    if (initializing) {
      return;
    }
    return SessionUseIsCurrent(locationSession).then(function(isCurrent) {
      if (!isCurrent || characterID != locationSession.characterID) {
        throw {error: 'stale'};
      }
      region = response.data['name'].replace(/ /gi, '_');
      reactiveData.characterLocation = systemName+', '+region;
      if (location.pathname.split('#')[0] != '/map/'+region+'/'+systemName &&
          location.pathname.split(':')[0] != '/map/'+region+'/'+systemName) {
        ChangePage(region, systemName);
      }
    });
  })
  .catch( error => {
    if (error == 'no update'){
      throw 'no update';
    }
    else if (error == 'tracking stopped'){
      throw 'tracking stopped';
    }
    else if (error && error.error == 'invalid_token') {
      throw 'tracking stopped';
    }
    else if (error && (error.error == 'transient' || error.error == 'stale')) {
      if (refreshToken != null) {
        initializationPending = true;
      }
      throw 'tracking stopped';
    }
    console.log('Character tracking request failed');
    return localGet_Promise('radarToken')
    .then( (items) => {
      if (token != items['radarToken']) {
        token = (typeof items['radarToken'] == 'undefined') ? null : items['radarToken'];
        return localGet_Promise(['radarRefreshToken', 'radarClientId'])
        .then( (items) => {
          refreshToken = (typeof items['radarRefreshToken'] == 'undefined') ? null : items['radarRefreshToken'];
          credentialClientId = (typeof items['radarClientId'] == 'undefined') ? null : items['radarClientId'];
          throw 'new token found';
        });
      }
      return localGet_Promise(['radarRefreshToken', 'radarClientId'])
      .then( (items) => {
        refreshToken = (typeof items['radarRefreshToken'] == 'undefined') ? null : items['radarRefreshToken'];
        credentialClientId = (typeof items['radarClientId'] == 'undefined') ? null : items['radarClientId'];
        if (refreshToken == null) {
          SetLogoutStateTopbar();
          throw 'refreshToken gone, setting logged out state';
        }
        return AttemptRefreshToken(refreshToken);
      })
    })
  })
  .catch( error => {
    if (error == 'no update' || error == 'new token found' || error == 'tracking stopped'){
      return Promise.resolve();
    }
    console.log('Character tracking stopped');
  });
}

function ChangePage(region, systemName) {
  var i = 1;
  var waypointArray = window.location.pathname.split('#')[0].split(':');
  var hash = window.location.hash;
  if (systemName == waypointArray[1]) {
    i += 1;
  }
  var waypointString = '';
  for (; i < waypointArray.length; i++) {
    waypointString += ':' + waypointArray[i];
  }
  location.href = 'https://evemaps.dotlan.net/map/'+region+'/'+systemName+waypointString+'?tracking'+hash;
}

/*
 * Tracking is controlled by the normal DOTLAN query string. Authentication
 * callbacks are handled by the Firefox identity flow, not by page URLs.
 */
function InitializeTrackingFromLocation() {
  var queryParameters = new URLSearchParams(window.location.search);
  if (queryParameters.has('tracking')) {
    radarTrackingEnabled = true;
  }
  return Promise.resolve();
}

/*
 * This function tries to get a new token; invalid_grant signs out, while transient failures preserve the session.
 */
function AttemptRefreshToken(tokenArg) {
  var tokenAtRequest = token;
  var currentRefreshToken = (refreshToken == null) ? tokenArg : refreshToken;
  var clientIdAtRequest = credentialClientId;

  function SessionIsCurrent(callback) {
    if (token != tokenAtRequest || tokenArg != currentRefreshToken ||
        refreshToken != currentRefreshToken || credentialClientId != clientIdAtRequest ||
        clientIdAtRequest != ESI_CLIENT_ID) {
      callback(false);
      return;
    }
    chrome.storage.local.get(['radarToken', 'radarRefreshToken', 'radarClientId'], (items) => {
      var lastError = chrome.runtime.lastError;
      if (lastError) {
        callback(false);
        return;
      }
      items = items || {};
      var storedToken = (typeof items['radarToken'] == 'undefined') ? null : items['radarToken'];
      var storedRefreshToken = (typeof items['radarRefreshToken'] == 'undefined') ? null : items['radarRefreshToken'];
      var storedClientId = (typeof items['radarClientId'] == 'undefined') ? null : items['radarClientId'];
      if (token != tokenAtRequest || tokenArg != currentRefreshToken || refreshToken != currentRefreshToken ||
          credentialClientId != clientIdAtRequest || storedToken != tokenAtRequest ||
          storedRefreshToken != currentRefreshToken || storedClientId != ESI_CLIENT_ID) {
        callback(false);
        return;
      }
      chrome.storage.local.get(['radarToken', 'radarRefreshToken', 'radarClientId'], (currentItems) => {
        var currentLastError = chrome.runtime.lastError;
        if (currentLastError) {
          callback(false);
          return;
        }
        currentItems = currentItems || {};
        var currentStoredToken = (typeof currentItems['radarToken'] == 'undefined') ? null : currentItems['radarToken'];
        var currentStoredRefreshToken = (typeof currentItems['radarRefreshToken'] == 'undefined') ? null : currentItems['radarRefreshToken'];
        var currentStoredClientId = (typeof currentItems['radarClientId'] == 'undefined') ? null : currentItems['radarClientId'];
        callback(token == tokenAtRequest && tokenArg == currentRefreshToken && refreshToken == currentRefreshToken &&
          credentialClientId == clientIdAtRequest && currentStoredToken == tokenAtRequest &&
          currentStoredRefreshToken == currentRefreshToken && currentStoredClientId == ESI_CLIENT_ID);
      });
    });
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {contentScriptQuery: "refreshToken", tokenArg: tokenArg},
      response => {
        var lastError = chrome.runtime.lastError;
        if (lastError) {
          reject({error: "transient"});
          return;
        }
        if (!response) {
          reject({error: "transient"});
          return;
        }
        if (response.error == "invalid_grant") {
          SessionIsCurrent((isCurrent) => {
            if (!isCurrent) {
              reject({error: "stale"});
              return;
            }
            RevokeToken();
            reject({error: "invalid_grant"});
          });
          return;
        }
        if (response.error ||
            typeof response.access_token != "string" ||
            response.access_token.length == 0 ||
            (Object.prototype.hasOwnProperty.call(response, 'refresh_token') &&
              (typeof response.refresh_token != "string" || response.refresh_token.length == 0))) {
          reject({error: "transient"});
          return;
        }
        SessionIsCurrent((isCurrent) => {
          if (!isCurrent) {
            reject({error: "stale"});
            return;
          }
          var newToken = response['access_token'];
          var newRefreshToken = currentRefreshToken;
          if (Object.prototype.hasOwnProperty.call(response, 'refresh_token')) {
            newRefreshToken = response['refresh_token'];
          }
          CredentialMessage_Promise({
            contentScriptQuery: 'storeCredentials',
            token: newToken,
            refreshToken: newRefreshToken,
            expectedToken: tokenAtRequest,
            expectedRefreshToken: currentRefreshToken,
            expectedClientId: clientIdAtRequest
          })
          .then( (result) => {
            if (!result || result.error) {
              reject(result && result.error ? result : {error: "transient"});
              return;
            }
            if (token != tokenAtRequest || refreshToken != currentRefreshToken ||
                credentialClientId != clientIdAtRequest) {
              reject({error: "stale"});
              return;
            }
            token = newToken;
            refreshToken = newRefreshToken;
            credentialClientId = ESI_CLIENT_ID;
            resolve();
          })
          .catch( (error) => {
            reject({error: "transient"});
          });
        });
      }
    );
  });
}

/*
 * Revokes all our current tokens, and sets our token values to null
 * Even if the revoke fails, we still remove our local tokens
 * 
 * We don't wait for the promises to resolve for this function
 */
function RevokeToken() {
  var tokenToRevoke = token;
  var refreshTokenToRevoke = refreshToken;
  var clientIdToRevoke = credentialClientId;
  var credentialsToClear = {
    token: tokenToRevoke,
    refreshToken: refreshTokenToRevoke,
    clientId: clientIdToRevoke
  };

  loginAttemptGeneration += 1;
  loginInProgress = false;
  SetLogoutStateTopbar(credentialsToClear);

  try {
    chrome.runtime.sendMessage(
      {contentScriptQuery: "revokeToken", token: tokenToRevoke, refreshToken: refreshTokenToRevoke,
        clientId: clientIdToRevoke},
      () => {
        var lastError = chrome.runtime.lastError;
        if (lastError) {
          return;
        }
      }
    );
  }
  catch (error) {
    return;
  }
}

/*
 * Resets the reactive data for when a user logs off in any tab
 */
function SetLogoutStateTopbar(credentialsToClear, clearSharedCredentials) {
  var expectedCredentials = credentialsToClear || {
    token: token,
    refreshToken: refreshToken,
    clientId: credentialClientId
  };
  SetSignedOutStateTopbar();
  if (clearSharedCredentials !== false) {
    ClearStoredCredentialsIfCurrent(expectedCredentials);
  }
}

function CredentialsHaveValue(credentials) {
  return credentials && (credentials.token != null || credentials.refreshToken != null ||
    credentials.clientId != null);
}

function CredentialMarkerKey(credentials) {
  var value = [credentials.token || '', credentials.refreshToken || '', credentials.clientId || ''].join('\u0000');
  var firstHash = 2166136261;
  var secondHash = 2246822519;
  var thirdHash = 3266489917;
  var fourthHash = 668265263;
  for (var i = 0; i < value.length; i++) {
    var code = value.charCodeAt(i);
    firstHash = Math.imul(firstHash ^ code, 16777619);
    secondHash = Math.imul(secondHash ^ code, 2246822519);
    thirdHash = Math.imul(thirdHash ^ code, 3266489917);
    fourthHash = Math.imul(fourthHash ^ code, 668265263);
  }
  return 'radarInvalidatedSession_' + (firstHash >>> 0).toString(16) +
    (secondHash >>> 0).toString(16) + (thirdHash >>> 0).toString(16) +
    (fourthHash >>> 0).toString(16);
}

function PersistCredentialInvalidation(credentials) {
  if (!CredentialsHaveValue(credentials)) {
    return Promise.resolve();
  }
  return new Promise(function(resolve) {
    var values = {};
    values[CredentialMarkerKey(credentials)] = true;
    try {
      chrome.storage.local.set(values, function() {
        var lastError = chrome.runtime.lastError;
        if (lastError) {
          resolve();
          return;
        }
        resolve();
      });
    }
    catch (error) {
      resolve();
    }
  });
}

function ClearStoredCredentialsIfCurrent(credentials) {
  if (!CredentialsHaveValue(credentials)) {
    return Promise.resolve();
  }
  return PersistCredentialInvalidation(credentials)
    .then(function() {
      return ClearCredentials_Promise(credentials);
    })
    .catch( () => {});
}

function CredentialInvalidationExists(credentials) {
  if (!CredentialsHaveValue(credentials)) {
    return Promise.resolve(false);
  }
  var markerKey = CredentialMarkerKey(credentials);
  return localGet_Promise(markerKey)
    .then(function(items) {
      return items[markerKey] === true;
    });
}

/*
 * Toggle for the 'tracking' notification on the top bar
 */
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

/*
 * helper function to get the data we have stored in chrome.storage.local for working across tabs and on new pages
 */
function syncData() {
  var syncGeneration = loginAttemptGeneration;
  var previousSession = GetSessionSnapshot();
  return localGet_Promise(['radarToken', 'radarRefreshToken', 'radarClientId'])
  .then( (items) => {
    if (syncGeneration != loginAttemptGeneration) {
      throw {error: 'stale'};
    }
    var storedToken = (typeof items['radarToken'] == 'undefined') ? null : items['radarToken'];
    var storedRefreshToken = (typeof items['radarRefreshToken'] == 'undefined') ? null : items['radarRefreshToken'];
    var storedClientId = (typeof items['radarClientId'] == 'undefined') ? null : items['radarClientId'];
    var storedCredentials = {
      token: storedToken,
      refreshToken: storedRefreshToken,
      clientId: storedClientId
    };
    if (!SessionsMatch(previousSession, storedCredentials)) {
      verifiedSessionCache = null;
      verifiedSessionPromise = null;
      sessionRecoveryPromise = null;
      ResetCharacterDetails();
    }
    return CredentialInvalidationExists(storedCredentials)
    .then(function(invalidated) {
      if (syncGeneration != loginAttemptGeneration) {
        throw {error: 'stale'};
      }
      if (invalidated) {
        verifiedSessionCache = null;
        verifiedSessionPromise = null;
        sessionRecoveryPromise = null;
        ResetCharacterDetails();
        token = null;
        refreshToken = null;
        credentialClientId = null;
        return ClearStoredCredentialsIfCurrent(storedCredentials);
      }
      if ((storedToken != null || storedRefreshToken != null) && storedClientId != ESI_CLIENT_ID) {
        verifiedSessionCache = null;
        verifiedSessionPromise = null;
        sessionRecoveryPromise = null;
        ResetCharacterDetails();
        token = null;
        refreshToken = null;
        credentialClientId = null;
        return ClearCredentials_Promise(storedCredentials);
      }
      token = storedToken;
      refreshToken = storedRefreshToken;
      credentialClientId = storedClientId;
      if (token == null && refreshToken != null && credentialClientId == ESI_CLIENT_ID) {
        initializationPending = true;
      }
    });
  })
}

var token = null;
var refreshToken = null;
var credentialClientId = null;
var loginInProgress = false;
var radarTrackingEnabled = false;
var systemName = null;
var region = null;
var characterLocation = null;
var characterID = null;
var characterHeartbeat = null;
var initializationPending = false;
var initializationInProgress = false;
var loginAttemptGeneration = 0;
var verifiedSessionCache = null;
var verifiedSessionPromise = null;
var sessionRecoveryPromise = null;

// Promise wrappers for chrome.storage.local
const localGet_Promise = key => new Promise((resolve, reject) => chrome.storage.local.get(key, items => {
  var lastError = chrome.runtime.lastError;
  if (lastError) {
    reject({error: 'transient'});
    return;
  }
  resolve(items || {});
}));
const CredentialMessage_Promise = request => new Promise((resolve, reject) => {
  try {
    chrome.runtime.sendMessage(request, response => {
      var lastError = chrome.runtime.lastError;
      if (lastError) {
        reject({error: 'transient'});
        return;
      }
      resolve(response || {error: 'transient'});
    });
  }
  catch (error) {
    reject({error: 'transient'});
  }
});

function ClearCredentials_Promise(credentials) {
  credentials = credentials || {
    token: token,
    refreshToken: refreshToken,
    clientId: credentialClientId
  };
  return CredentialMessage_Promise({
    contentScriptQuery: 'clearCredentials',
    expectedToken: credentials.token,
    expectedRefreshToken: credentials.refreshToken,
    expectedClientId: credentials.clientId
  });
}

function StartHeartbeat() {
  if (characterHeartbeat == null) {
    characterHeartbeat = setInterval(FindCharacter, 1000);
  }
}

reactiveData.signInLink = 'javascript:;';
reactiveData.signInOnClick = StartLogin;
reactiveData.trackingTriggerFunction = radarTrackingTrigger;

// 'main'
InitializeTrackingFromLocation()
.then( () => {
  return syncData();
})
.then( () => {
  if (refreshToken != null) {
    reactiveData.signInText = 'Sign Out';
    reactiveData.signInOnClick = RevokeToken;
    reactiveData.signInLink = 'javascript:;';
  }
  if (token == null && refreshToken != null) {
    return AttemptRefreshToken(refreshToken);
  }
})
.then( () => {
  if(token != null && radarTrackingEnabled == true) {
    return GetCharacterID();
  }
  else if (token != null) {
    return GetCharacterID().then( () => {
      radarTrackingTrigger();
    })
  }
})
.then ( () => {
  StartHeartbeat();
})
.catch( () => {
  initializationPending = true;
  StartHeartbeat();
});
