import Promise from 'bluebird'
import fs from 'fs'
import https from 'https'
import { readDir, createHashForFile } from '../utils/fileUtils.js'
import crypto from 'crypto'
import winston from '../utils/log';
import { writeFile } from "fs";

const HOME_DIR = process.env.HOME || process.env.USERPROFILE;
const FILE_DIR = `${HOME_DIR}/SmartsafeClient`;
const TEMP_DIR = `${HOME_DIR}/SmartsafeClient`;

const IGNORED_FILES = ['.DS_Store', 'temp'];

import { dropboxClient, ethereumClient } from '../main.js'


function logDebug(err) {
  winston.log('debug', err)
}

function logError(err) {
  winston.log('error', err)
}

// filesHashesFromEth
export function synchronizeUserFiles(filesHashesFromEth, localFilesFullPaths) {
  /// Upload local files
  var filesHashesFromEth2 = Promise.resolve(filesHashesFromEth);

  var localFilesFullPaths2 = Promise.resolve(localFilesFullPaths);
  var preparedFileDataForFiles = localFilesFullPaths2.then(localFilesFullPaths21 => {
    return Promise.all(localFilesFullPaths21.map(locafileFullPath => {
      return prepareFileDataForFiles(locafileFullPath);
    }));
  });

  Promise.join(preparedFileDataForFiles, filesHashesFromEth2, (localFilesData, filesHashesFromEth21) => {
    return Promise.all(localFilesData.map(localFileData => {
      const localFileName = localFileData.fileName;
      const localFileHash = localFileData.fileInfo;
      if (!fileMetaDataUploadedToEth(localFileHash, filesHashesFromEth21)) {
        return uploadLocalFilesToDropbox(localFileName, localFileHash)
      }
      return Promise.resolve()

    }))
  }).then(filesDataToEth => {
    return Promise.all(filesDataToEth.map(fileDataToEth => {
      if (fileDataToEth == null) return Promise.resolve();
      return uploadLocalFileMetaDataToEth(fileDataToEth)
    }));
  }).catch(err => {
    logError(err);
  });

  /// Download missing local files
  var filesHashesFromEth3 = Promise.resolve(filesHashesFromEth);

  var localFilesFullPaths3 = Promise.resolve(localFilesFullPaths);
  var preparedFileDataForFiles2 = localFilesFullPaths3.then(localFilesFullPaths31 => {
    return Promise.all(localFilesFullPaths31.map(localFileFullPath => {
      return prepareFileDataForFiles(localFileFullPath);
    }));
  });

  Promise.join(preparedFileDataForFiles2, filesHashesFromEth3, (localFilesData, filesHashesFromEth31) => {
    return Promise.all(filesHashesFromEth31.map(filesHash => {
      return getFilesOnEthNotLocallyPresent(localFilesData, filesHash);
    }))
  }).then(filesEthMetaData => {
    // if (filesEthMetaData == null) return Promise.resolve();
    // if (filesEthMetaData.length === -1) return Promise.resolve();

    return Promise.all(filesEthMetaData.map(fileEthMetaData => {
      if (fileEthMetaData == null) return Promise.resolve();
      return Promise.resolve(downloadFileFromDropbox(fileEthMetaData));
    }))
  }).catch(err => {
    logError(err);
  })

}

function getFilesOnEthNotLocallyPresent(localFilesData, fileEthHash) {
  return new Promise((resolve, reject) => {
    for (let localFileDataIndex = 0; localFileDataIndex < localFilesData.length; localFileDataIndex++) {
      const localFileData = localFilesData[localFileDataIndex];
      const localFileHash = localFileData.fileInfo;
      if (localFileHash === fileEthHash) {
        return resolve()
      }
    }
    downloadMetaDataFromEthWithHash(fileEthHash).then(fileMetaDataFromEth => {
      return resolve(fileMetaDataFromEth);
    })
  });
}

function downloadMetaDataFromEthWithHash(fileHash) {
  return new Promise((resolve, reject) => {
    (ethereumClient.findFileMetaDataFromEthChain(fileHash)).then(fileMetaDataFromEth => {
      return resolve(fileMetaDataFromEth)
    })
  })
}

function fileMetaDataUploadedToEth(hash, ethHashes) {
  return ethHashes.indexOf(hash) !== -1;
}

function prepareFileDataForFiles(filePath) {
  return new Promise((resolve, reject) => {
    const fileName = getFileNameFromFilePath(filePath);
    const readStream = fs.createReadStream(getFullPathForFileName(fileName));

    readStream.on('error', (error) => {
      throw error
    });

    return createHashForFile(readStream).then(fileData => {
      return resolve({
        fileName: fileName,
        fileInfo: fileData
      })
    })
  })
}

function getFullPathForFileName(fileName) {
  return `${FILE_DIR}/${fileName}`;
}

function getFileNameFromFilePath(filePath) {
  return filePath.substring(filePath.lastIndexOf(FILE_DIR) + FILE_DIR.length + 1, filePath.length);
}

function uploadLocalFilesToDropbox(fileName, fileHash) {
  return new Promise((resolve, reject) => {
    Promise.resolve(dropboxClient.upload(`${FILE_DIR}/${fileName}`, `/${fileName}`))
      .then(responseJson => {
        return resolve({
          fileName: fileName,
          fileHash: fileHash,
          fileSharedLink: responseJson.url
        });
      })
  })
}

function uploadLocalFileMetaDataToEth(fileData) {
  return new Promise((resolve, reject) => {
    const fileName = fileData.fileName;
    const fileHash = fileData.fileHash;
    const fileDropboxSharedLink = fileData.fileSharedLink;
    ethereumClient.addFileMetaData(fileHash, fileDropboxSharedLink, fileName).then(() => {
      return resolve()
    });

  })
}

// TODO: if the file was in a dir, put it into a dir
function downloadFileFromDropbox(fileMetaDataFromEth) {
  return new Promise((resolve, reject) => {
    const downloadUrl = DropboxClient.getDirectDownloadLink(fileMetaDataFromEth.link);
    const fileName = DropboxClient.getFileNameFromUrl(downloadUrl);
    const fileStream = fs.createWriteStream(`${FILE_DIR}/${fileName}`);
    https.get(downloadUrl, fileToDownload => {
      fileToDownload.pipe(fileStream)
    });
    return resolve()
  })
}


// contracts
// ethereumClient.loadContracts().then((address) => {
//     writeFile('contracts.json', JSON.stringify({file: address}), (err) => {
//         if (err) console.log(err)
//     });
//     console.log('contracts loaded')
// }).catch((e) => {
//     console.log(e)
// });

// folder synchronization
dropboxClient.authenticate()
  .then(() => {
    if (!fs.existsSync(FILE_DIR)) {
      fs.mkdirSync(FILE_DIR);
    }
    return readDir(FILE_DIR)
  }).then(files => {
  const userFilesLocations = files.filter((file) => {
    return IGNORED_FILES.indexOf(file) === -1
  });

  return ethereumClient.getUserFilesHashes()
    .then(filesHashesFromEth => {
      return synchronizeUserFiles(filesHashesFromEth, userFilesLocations)
    })
}).catch(err => logError(err));

// new file upload
// dropboxClient.authenticate().then(() => {
//     ethereumClient.watchFileChanges(onNewFile)
// });
//
//
// function onNewFile({url, hash}) {
//     // Replace dl=0 with dl=1 to get direct downloadable link
//     const dlUrl = DropboxClient.getDirectDownloadLink(url);
//     const fileName = DropboxClient.getFileNameFromUrl(dlUrl);
//     const file = fs.createWriteStream(`${TEMP_DIR}/${fileName}`);
//     https.get(dlUrl, (res) => {
//         res.pipe(file);
//         file.on('finish', () => {
//             if (fileName) {
//                 dropboxClient.upload(`${TEMP_DIR}/${fileName}`, `/${fileName}`)
//                     .then((data) => {
//                         ethereumClient.addAPeer(hash, data.url)
//                             .then(() => {
//                                 ethereumClient.getPeer(hash)
//                                 .then((peerUrl) => {
//                                     console.log('peerUrl', peerUrl)
//                             })
//                         }).catch((e) => {
//                             console.log(e)
//                         })
//                     })
//             }
//         })
//     }).on('error', (err) => console.log(err))
// }

// recursively list files user's Dropbox folder
// dropboxClient.authenticate()
//     .then(() => {
//         dropboxClient.listFolder()
//             .then(result => {
//                 let files = Array.from(result);
//                 if (files.length !== 0) {
//                     files.forEach(res => {
//                         logDebug(res.name)
//                     });
//                 } else {
//                     logError("No files in user's folder")
//                 }
//             });
//     }).catch(err => logError(err));