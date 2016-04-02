var fs = require('fs');
var google = require('googleapis');
var driveApi = require('./driveAPI');
var RateLimiter = require('limiter').RateLimiter;

// Allow 6 requests per second, GDrive limit is 10 per second but measured on their side so as there are no atomic 
// transaction better be on the safe side
var limiter = new RateLimiter(6, 'second');
var program = require('commander');

program
  .version('0.0.1');

program
  .command("fix [extension]")
  .description("Try to fix all the files with the provided extension")
  .action(function(extension) {
    init(function(auth) {
      fixFiles(auth, extension);
    });
  });

program
  .command("deleteAll [fileName]")
  .description("delete all files with the given name")
  .action(function(name) {
    init(function(auth) {
      deleteFiles(auth, name);
    });
  });

program
  .parse(process.argv);

if (!process.argv.slice(2).length) {
    program.outputHelp();
    return;
}

function init(callback) {
  // Load client secrets from a local file.
  fs.readFile('client_secret.json', function processClientSecrets(err, content) {
    if (err) {
      console.log('Error loading client secret file: ' + err);
      return;
    }
    driveApi.authorize(JSON.parse(content), function(auth) {
      limiter.removeTokens(6, function() {
        callback(auth);
      });
    });
  });
}

function deleteFiles(auth, name) {
  var q = "name = '" + name + "'";
  console.log(q);
  listFolderFiles(auth, q, null, function(file) {
    //Just in case
    if (file.name === name) {
      console.log("deleting: %s - %s", file.name, file.id);
      deleteFile(auth, file.id);
    }
  });
}

function fixFiles(auth, extension) {
  var q = "name contains '" + extension + "'";
  listFolderFiles(auth, q, null, function(file) {
    fixFile(auth, file, extension);
  });
}

/**
 * This function will list revisions, and try to delete the last one and rename the file with the name in the previous one
 * in case there is only one revision and the name on the revision and the file does not match then it will rename the file with 
 * the revision name
 * @param  {json} auth GDrive auth object
 * @param  {file} file GDrive file object
 */
function fixFile(auth, file, extension) {
  if (!checkExtension(file.name, extension)) {
    return;
  }
  console.log('%s - %s', file.name, file.id);
  var id = file.id;
  listRevisions(auth, id, function(response) {
    //Do nothing if there are less than 2 revisions & the first revision has the doomed extension
    var revisions = sortRevisionsByDate(response.revisions);
    if (response.revisions.length < 2 && checkExtension(revisions[0].originalFilename)) {
      return;
    }
    // This is the only point where atomic transactions would be great
    // If the first revision has the extension then remove the revision and rename
    if (checkExtension(revisions[0].originalFilename, extension)) {
      deleteRevision(auth, id, revisions[0].id, function() {
        renameFile(auth, id, revisions[1].originalFilename);
      });
    } else {
      //We are here due to some api limit error or problem like that, the revision was deleted but it was not renamed
      renameFile(auth, id, revisions[0].originalFilename);
    }
  });
}

function sortRevisionsByDate(array) {
  return array.sort(function(a, b) {
    var c = new Date(a.modifiedTime);
    var d = new Date(b.modifiedTime);
    return d - c;
  });
}

/**
 * @param  {json} auth GDrive auth object
 * @param  {string} id File id
 */
function deleteFile(auth, id) {
  var service = google.drive('v3');
  limiter.removeTokens(1, function(err, remainingRequests) {
  console.log("deleting: %s", id);
    service.files.delete({
      auth: auth,
      fileId: id,
    }, function(err, response) {
      if (err) {
        console.log('The API returned an error: ' + err);
      }
    });
  });
}

/**
 * @param  {json} auth GDrive auth object
 * @param  {string} id File id
 * @param  {string} name new name for the file
 */
function renameFile(auth, id, name) {
  var service = google.drive('v3');
  limiter.removeTokens(1, function(err, remainingRequests) {
    console.log("renaming to: %s", name);
    service.files.update({
      auth: auth,
      fileId: id,
      resource: {
        name: name
      }
    }, function(err, response) {
      if (err) {
        console.log('The API returned an error: ' + err);
      }
    });
  });
}

/**
 * @param  {json} auth GDrive auth object
 * @param  {string} id File id
 * @param  {string} revId Revsion id
 * @param  {Function} callback to notify when it is done
 */
function deleteRevision(auth, id, revId, callback) {
  var service = google.drive('v3');
  limiter.removeTokens(1, function(err, remainingRequests) {
    console.log("deleting revision: %s", revId);
    service.revisions.delete({
      auth: auth,
      fileId: id,
      revisionId: revId
    }, function(err, response) {
      if (err) {
        console.log('The API returned an error: ' + err);
        return;
      }
      callback();
    });
  });
}

/**
 * @param  {json} auth GDrive auth object
 * @param  {string} id of the file to look for revisions
 * @param  {Function} callback that process the response
 */
function listRevisions(auth, id, callback) {
  var service = google.drive('v3');
  limiter.removeTokens(1, function(err, remainingRequests) {
    service.revisions.list({
      auth: auth,
      fileId: id,
      fields: "revisions(id, modifiedTime, originalFilename)"
    }, function(err, response) {
      if (err) {
        console.log('The API returned an error: ' + err);
        return;
      } else {
        callback(response);
      }
    });
  });
}


/**
 * This funtion list all files according a query and apply a function to every file that is not a folder nor trashed
 * @param  {json} GDrive auth object
 * @param  {string} Id of the parent folder
 * @param  {string} q Query string
 * @param  {string} NextPageToken to continue previous query
 * @param  {Function} function to be applied to every file that is not a folder
 */
function listFolderFiles(auth, q, token, callback) {
  listFiles(auth, q, token, function(response) {
    var files = response.files;
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (!file.trashed && !isFolder(file) && file.capabilities.canEdit) {
        callback(file);
      }
    }
    //Not tested    
    if (response.nextPageToken !== undefined && response.nextPageToken !== "") {
      listFolderFiles(auth, q, response.nextPageToken, callback);
    }
  });
}

function isFolder(file) {
  return file.mimeType == 'application/vnd.google-apps.folder';
}

function checkExtension(fileName, extension) {
  return fileName.endsWith(extension);
}

/**
 * Utility function to list GDrive files by query
 * @param  Goggle auth object
 * @param  {string}  Query String
 * @param  {string} nextPageToken to continue with the new page
 * @param  {Function} callback function to process the response
 */
function listFiles(auth, q, nextPageToken, callback) {
  var service = google.drive('v3');
  limiter.removeTokens(1, function(err, remainingRequests) {
    service.files.list({
      auth: auth,
      q: q,
      pageToken: nextPageToken,
      pageSize: 1000,
      fields: "nextPageToken, files(id, name, mimeType, trashed, capabilities)"
    }, function(err, response) {
      if (err) {
        console.log('The API returned an error: ' + err);
        return;
      } else {
        callback(response);
      }
    });
  });
}