
var ESI_CLIENT_ID = 'f7b4d46e9ec2494481e8a40fd860540a';

function StartLogin(event) {
  if (event && event.preventDefault) {
    event.preventDefault();
  }
  if (loginInProgress) {
    return false;
  }
  loginInProgress = true;
  reactiveData.signInText = 'Signing in...';
  try {
    chrome.runtime.sendMessage(
      {contentScriptQuery: 'startAuth'},
      response => {
        var lastError = chrome.runtime.lastError;
        loginInProgress = false;
        if (lastError || !response || response.error) {
          console.log('Authentication flow failed');
          SetLogoutStateTopbar();
          return;
        }
        syncData()
        .then( () => {
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
          console.log('Authentication setup failed');
          SetLogoutStateTopbar();
        });
      }
    );
  }
  catch (error) {
    loginInProgress = false;
    console.log('Authentication flow failed');
    SetLogoutStateTopbar();
  }
  return false;
}

/*
 * attempts to get character information by verifying our token
 * if the token is good, the information in the topbar is set
 * if it's bad, we try to refresh the token
 */
function GetCharacterID() {
  return Promise.resolve().then( () => {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    response = JSON.parse(jsonPayload);
    if (typeof response['name'] == 'undefined' || typeof response['sub'] == 'undefined') {
      throw "bad token"
    }

    characterID = response.sub.split(':')[2];
    reactiveData.characterName = response.name;
    reactiveData.charLocationDisplay = '';
    reactiveData.notifierDisplay = '';
    reactiveData.topbarContainerAnimation = 'none';
    reactiveData.topbarContainerAnimationModifier = 'none';
    reactiveData.notifierData = 'Tracking... | ';
    reactiveData.characterPortrait = 'https://image.eveonline.com/Character/'+characterID+'_32.jpg';
  })
  .catch( (error) => {
    console.log('Unable to read character token');
    return localGet_Promise(['radarRefreshToken', 'radarClientId'])
    .then( (items) => {
      refreshToken = (typeof items['radarRefreshToken'] == 'undefined') ? null : items['radarRefreshToken'];
      credentialClientId = (typeof items['radarClientId'] == 'undefined') ? null : items['radarClientId'];
      if (refreshToken != null) {
        return AttemptRefreshToken(refreshToken)
        .then( () => {
          return GetCharacterID();
        });
      }
    })
  })
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
        return GetCharacterID();
      }
    }
  })
  .then( () => {
    if (initializing) {
      return;
    }
    return axios({
      method: 'get',
      url: 'https://esi.evetech.net/latest/characters/'+characterID+'/location/?language=en',
      headers: {Authorization: 'Bearer '+token}
    })
  })
  .then( (response) => {
    if (initializing) {
      return;
    }
    if (characterLocation == response.data['solar_system_id']) {throw 'no update';}
    characterLocation = response.data['solar_system_id'];
    return axios({
      method: 'get',
      url: 'https://esi.evetech.net/latest/universe/systems/'+response.data['solar_system_id']+'/?language=en'
    })
  })
  .then( (response) => {
    if (initializing) {
      return;
    }
    systemName = response.data['name'].replace(/ /gi, '_');
    return axios({
      method: 'get',
      url: 'https://esi.evetech.net/latest/universe/constellations/'+response.data['constellation_id']+'/?language=en'
    })
  })
  .then( (response) => {
    if (initializing) {
      return;
    }
    return axios({
      method: 'get',
      url: 'https://esi.evetech.net/latest/universe/regions/'+response.data['region_id']+'/?language=en'
    })
  })
  .then( (response) => {
    if (initializing) {
      return;
    }
    region = response.data['name'].replace(/ /gi, '_');
    reactiveData.characterLocation = systemName+', '+region;
    if (location.pathname.split('#')[0] != '/map/'+region+'/'+systemName &&
        location.pathname.split(':')[0] != '/map/'+region+'/'+systemName) {
      ChangePage(region, systemName);
    }
  })
  .catch( error => {
    if (error == 'no update'){
      throw 'no update';
    }
    else if (error == 'tracking stopped'){
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
      callback(token == tokenAtRequest && tokenArg == currentRefreshToken && refreshToken == currentRefreshToken &&
        credentialClientId == clientIdAtRequest && storedToken == tokenAtRequest &&
        storedRefreshToken == currentRefreshToken && storedClientId == ESI_CLIENT_ID);
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
          localSet_Promise({
            radarToken: newToken,
            radarRefreshToken: newRefreshToken,
            radarClientId: ESI_CLIENT_ID
          })
          .then( () => {
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

  token = null;
  refreshToken = null;
  credentialClientId = null;
  SetLogoutStateTopbar();

  try {
    chrome.runtime.sendMessage(
      {contentScriptQuery: "revokeToken", token: tokenToRevoke, refreshToken: refreshTokenToRevoke},
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
function SetLogoutStateTopbar() {
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
  localSet_Promise({
    radarToken: null,
    radarRefreshToken: null,
    radarClientId: null
  })
  .catch( () => {});
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
  return localGet_Promise(['radarToken', 'radarRefreshToken', 'radarClientId'])
  .then( (items) => {
    var storedToken = (typeof items['radarToken'] == 'undefined') ? null : items['radarToken'];
    var storedRefreshToken = (typeof items['radarRefreshToken'] == 'undefined') ? null : items['radarRefreshToken'];
    var storedClientId = (typeof items['radarClientId'] == 'undefined') ? null : items['radarClientId'];
    if ((storedToken != null || storedRefreshToken != null) && storedClientId != ESI_CLIENT_ID) {
      token = null;
      refreshToken = null;
      credentialClientId = null;
      return localSet_Promise({
        radarToken: null,
        radarRefreshToken: null,
        radarClientId: null
      });
    }
    token = storedToken;
    refreshToken = storedRefreshToken;
    credentialClientId = storedClientId;
    if (token == null && refreshToken != null && credentialClientId == ESI_CLIENT_ID) {
      initializationPending = true;
    }
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

// Promise wrappers for chrome.storage.local
const localGet_Promise = key => new Promise((resolve, reject) => chrome.storage.local.get(key, items => {
  var lastError = chrome.runtime.lastError;
  if (lastError) {
    reject({error: 'transient'});
    return;
  }
  resolve(items || {});
}));
const localSet_Promise = values => new Promise((resolve, reject) => chrome.storage.local.set(values, () => {
  var lastError = chrome.runtime.lastError;
  if (lastError) {
    reject({error: 'transient'});
    return;
  }
  resolve();
}));

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
