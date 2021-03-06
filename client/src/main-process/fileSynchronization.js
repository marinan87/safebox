import Promise from 'bluebird';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { readDir, createHashForFile, checkExistence, isFileEncrypted, getUnencryptedFileName } from '../utils/fileUtils.js';
import * as cryptoUtils from '../utils/cryptoUtils.js';
import winston from '../utils/log';
import DropboxClient from '../api/dropboxApi.js';
const readFile = Promise.promisify(require("fs").readFile);


const CONTRACTS_FILE = '/../../contracts.json';
const HOME_DIR = process.env.HOME || process.env.USERPROFILE;
const FILE_DIR = replaceBwdWithFwdSlash(`${HOME_DIR}/SmartsafeClient`);
const KEYS_DIR = `${HOME_DIR}/.smartsafeKeys`;
const PUBLIC_KEY = `${KEYS_DIR}/rsa.pub`;
const PRIVATE_KEY = `${KEYS_DIR}/rsa`;
const SYMMETRIC_KEY = 'fkdhf209uc5v5mnr5e3e2';

const IGNORED_FILES = ['.DS_Store', 'temp'];

import { dropboxClient, ethereumClient, sendRendererEvent } from '../main.js';
// NOTE exports at the very end of file


if (!fs.existsSync(FILE_DIR)) {
    fs.mkdirSync(FILE_DIR);
}


function logDebug(err) {
    winston.log('debug', err);
}

function logError(err) {
    winston.log('error', err);
}

function synchronizeUserFiles(filesHashesFromEth, localFilesFullPaths) {


    const preparedFileDataForFiles = Promise.resolve(localFilesFullPaths).then(localFilesFullPaths => {
        return Promise.all(localFilesFullPaths.map(localFileFullPath => {
            return prepareFileDataForFiles(localFileFullPath);
        }));
    });

    /// Upload local files
    Promise.join(preparedFileDataForFiles, filesHashesFromEth, (localFilesData, filesHashesFromEth) => {
        return Promise.all(localFilesData.map(localFileData => {
            const localFileName = localFileData.fileName;
            const localFileHash = localFileData.fileInfo;
            if (!fileMetaDataUploadedToEth(localFileHash, filesHashesFromEth)) {
                return uploadLocalFilesToDropbox(localFileName, localFileHash)
            }
            return Promise.resolve();

        }));
    }).then(filesDataToEth => {
        return Promise.all(filesDataToEth.map(fileDataToEth => {
            if (fileDataToEth == null) return Promise.resolve();
            return uploadLocalFileMetaDataToEth(fileDataToEth)
        }));
    }).catch(err => {
        logError(err);
    });

    /// Download missing local files
    Promise.join(preparedFileDataForFiles, filesHashesFromEth, (localFilesData, filesHashesFromEth) => {
        return Promise.all(filesHashesFromEth.map(filesHash => {
            return getFilesOnEthNotLocallyPresent(localFilesData, filesHash);
        }));
    }).then(filesEthMetaData => {
        return Promise.all(filesEthMetaData.map(fileEthMetaData => {
            if (fileEthMetaData == null) return Promise.resolve();
            return Promise.resolve(getFileFromDropboxToFileDir(fileEthMetaData));
        }));
    }).catch(err => {
        logError(err);
    });

}

function getFilesOnEthNotLocallyPresent(localFilesData, fileEthHash) {
    return new Promise((resolve, reject) => {
        for (let localFileNo = 0; localFileNo < localFilesData.length; localFileNo++) {
            const localFileData = localFilesData[localFileNo];
            const localFileHash = localFileData.fileInfo;
            if (localFileHash === fileEthHash) {
                return resolve();
            }
        }
        downloadMetaDataFromEthWithHash(fileEthHash).then(fileMetaDataFromEth => {
            return resolve(fileMetaDataFromEth);
        });
    });
}

function downloadMetaDataFromEthWithHash(fileHash) {
    return new Promise((resolve, reject) => {
        (ethereumClient.findFileMetaDataFromEthChain(fileHash)).then(fileMetaDataFromEth => {
            return resolve(fileMetaDataFromEth);
        });
    });
}

function fileMetaDataUploadedToEth(hash, ethHashes) {
    return ethHashes.indexOf(hash) !== -1;
}

function prepareFileDataForFiles(filePath) {
    return new Promise((resolve, reject) => {
        const fileName = getFileNameFromFilePath(filePath);
        getHashForFile(filePath).then(fileHash => {
            return resolve({
                fileName: fileName,
                fileHash: fileHash
            })
        });
    });
}

function getHashForFile(filePath) {
    return new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(filePath);
        readStream.on('error', (error) => {
            //return
            reject(error);
        });
        return resolve(createHashForFile(readStream));
    });
}


function getFullPathForFileName(fileName) {
    return `${FILE_DIR}/${fileName}`;
}

function replaceBwdWithFwdSlash(filePath) {
    return filePath.split("\\").join("/");
}
function getFileNameFromFilePath(filePath) {
    const filePathReplaced = replaceBwdWithFwdSlash(filePath);
    return filePathReplaced.substring(FILE_DIR.length + 1, filePathReplaced.length);
}

function uploadLocalFilesToDropbox(fileName, fileHash) {
    return uploadFileToDropbox(`${FILE_DIR}/${fileName}`, fileHash);
}

function uploadBrowsedFileToDropbox(filePath, fileHash) {
    return uploadFileToDropbox(filePath, fileHash);
}

function uploadFileToDropbox(filePath, fileHash) {
    return new Promise((resolve, reject) => {
        logDebug(`Uploading ${filePath}`);
        const fileName = path.basename(filePath);
        Promise.resolve(dropboxClient.upload(filePath, `/${fileName}`))
            .then(responseJson => {
                return resolve({
                    fileName: fileName,
                    fileHash: fileHash,
                    fileSharedLink: responseJson.url
                });
            }).catch(err => {
            logError(err);
            return reject(err);
        });
    });
}

// // toDo: ??? delete encrypted file
// function uploadEncryptedLocalFilesToDropbox(fileName) {
//     return cryptoUtils.generatePassword().then(function(password) {
//         saveEncryptedPasswordToDatabase(password);
//         return cryptoUtils.encryptWithSymmetricKey(getFullPathForFileName(fileName), SYMMETRIC_KEY, `${FILE_DIR}/${fileName}.enc`);
//     }).then(function(encryptedFileName) {
//         const encryptedFileLocalName = getFileNameFromFilePath(encryptedFileName);
//         return new Promise([encryptedFileLocalName, getHashForFile(encryptedFileName)]);
//     }).then(function([encryptedFileName, encryptedFileHash]) {
//         return uploadLocalFilesToDropbox(encryptedFileName, encryptedFileHash);
//     }).catch(function(err) {
//         logError(err);
//     });
// }

function encryptAndUploadFileToDropbox(filePath) {
    return cryptoUtils.generatePassword().then(function(password) {
        saveEncryptedPasswordToDatabase(password);
        const fileName = path.basename(filePath);
        return cryptoUtils.encryptWithSymmetricKey(filePath, SYMMETRIC_KEY, `${FILE_DIR}/${fileName}.enc`);
    }).then(function(encryptedFilePath) {
        return Promise.all([encryptedFilePath, getHashForFile(encryptedFilePath)]);
    }).then(function([encryptedFilePath, encryptedFileHash]) {
        return uploadBrowsedFileToDropbox(encryptedFilePath, encryptedFileHash);
    }).catch(function(err) {
        logError(err);
    });
}

function saveEncryptedPasswordToDatabase(password) {
    return encryptWithUserPublicKey(password);
// save to database
}

function encryptWithUserPublicKey(text) {
    return ensureKeyPair().then(function() {
        return Promise.resolve(fs.readFileSync(PUBLIC_KEY));
    }).then(function(key) {
        return cryptoUtils.encryptWithPublicKey(text, key);
    });
}

function decryptWithUserPrivateKey(text) {
    return ensureKeyPair().then(function() {
        return Promise.resolve(fs.readFileSync(PRIVATE_KEY));
    }).then(function(key) {
        return cryptoUtils.decryptWithPrivateKey(text, key);
    });
}

function ensureKeyPair() {
    return checkExistence(KEYS_DIR).catch(function() {
        return Promise.resolve(fs.mkdirSync(KEYS_DIR));
    }).then(function() {
        return Promise.all([checkExistence(PUBLIC_KEY), checkExistence(PRIVATE_KEY)]);
    }).catch(function(err) {
        return createKeyPair();
    });
}

function createKeyPair() {
    return cryptoUtils.generateRsaKeyPair().then(function(keys) {
        return Promise.all([fs.writeFileSync(PUBLIC_KEY, keys.public), fs.writeFileSync(PRIVATE_KEY, keys.private)]);
    }).catch(function(err) {
        logError(err);
    });
}

function uploadLocalFileMetaDataToEth(fileData) {
    return new Promise((resolve, reject) => {
        const fileName = fileData.fileName;
        const fileHash = fileData.fileHash;
        logDebug("fn" + fileName);
        encryptWithUserPublicKey(fileData.fileSharedLink).then(fileDropboxSharedLinkEncrypted => {
            logDebug("fileDropboxSharedLinkEncrypted" + fileDropboxSharedLinkEncrypted);
            return ethereumClient.addFileMetaData(fileHash, fileDropboxSharedLinkEncrypted, fileName);
        }).then(() => {
            return resolve();
        });
    });
}

function getFileFromDropboxToFileDir(fileMetaDataFromEth) {
    return Promise.resolve(fileMetaDataFromEth.link).then(encryptedDownloadUrl => {
        return decryptWithUserPrivateKey(encryptedDownloadUrl);
    }).then(function(dropboxLink) {
        return downloadFileFromDropbox(dropboxLink);
    }).then(function(fileName) {
        return decryptFileIfEncrypted(fileName);
    });
}

// TODO: if the file was in a dir, put it into a dir
function downloadFileFromDropbox(dropboxLink) {
    return new Promise((resolve, reject) => {
        const downloadUrl = DropboxClient.getDirectDownloadLink(dropboxLink);
        logDebug(`Downloading file: ${downloadUrl}`);
        const fileName = DropboxClient.getFileNameFromUrl(downloadUrl);
        const fileStream = fs.createWriteStream(`${FILE_DIR}/${fileName}`);

        fileStream.on('finish', () => {
            resolve(fileName);
        });

        https.get(downloadUrl, (fileToDownload) => {
            fileToDownload.pipe(fileStream);
        });
    });
}

function decryptFileIfEncrypted(fileName) {
    const fullName = `${FILE_DIR}/${fileName}`;
    if (isFileEncrypted(fileName)) {
        return cryptoUtils.decryptWithSymmetricKey(fullName, SYMMETRIC_KEY);
    } else {
        return Promise.resolve(fullName);
    }
}

function getFileHashesFromEth() {
    return ethereumClient.getUserFilesHashes().then((userFileHashes) => {
        winston.debug('Got file info from Eth');
        winston.debug(JSON.stringify(userFileHashes));
        return userFileHashes;
    });
}

// set the watcher for contracts.js
// ethereumClient.loadContracts().then((address) => {
//
//     console.log('contracts loaded')
// }).catch((e) => {
//     console.log(e)
// });


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



function startEthereum() {

    return readFile(__dirname + CONTRACTS_FILE, 'utf8').then(contracts => {
        logDebug('Ethereum start - parse contracts');
        return JSON.parse(contracts);
    }).then(parsedContracts => {
        logDebug('Ethereum start - deploy contracts');
        return ethereumClient.deployParsedContract(parsedContracts);
    }).then(() => {
        logDebug('Ethereum start - set watch for file changes');
        ethereumClient.watchFileChanges(onNewFile);
    }).catch(err => logError(err));
}

function synchronizeAllFiles() {
    return readDir(FILE_DIR)
        .then(files => {
            winston.debug('File sync - start file sync');
            const userFilesLocations = files.filter((file) => {
                return IGNORED_FILES.indexOf(file) === -1;
            });

            winston.debug('File sync - get file hashes');
            return ethereumClient.getUserFilesHashes()
                .then(filesHashesFromEth => {
                    winston.debug('File sync - sync files');
                    return synchronizeUserFiles(filesHashesFromEth, userFilesLocations);
                });
        }).catch(err => logError(err));
}

function onNewFile({url, hash}) {
    logDebug(`New file added to chain. Url: ${url}, hahs: ${hash}`);
    checkFileByHash(hash).then(([metaData, fileStatus]) => {
        sendRendererEvent('set-file-protection-status', metaData, fileStatus);
    });
// const dlUrl = DropboxClient.getDirectDownloadLink(url);
// const fileName = DropboxClient.getFileNameFromUrl(dlUrl);
// const file = fs.createWriteStream(`${TEMP_DIR}/${fileName}`);
// https.get(dlUrl, (res) => {
//     res.pipe(file);
//     file.on('finish', () => {
//         if (fileName) {
//             dropboxClient.upload(`${TEMP_DIR}/${fileName}`, `/${fileName}`)
//                 .then((data) => {
//                     ethereumClient.addAPeer(hash, data.url)
//                         .then(() => {
//                             ethereumClient.getPeer(hash)
//                             .then((peerUrl) => {
//                                 console.log('peerUrl', peerUrl)
//                         })
//                     }).catch((e) => {
//                         console.log(e)
//                     })
//                 })
//         }
//     })
// }).on('error', (err) => console.log(err))
}


function checkFileByHash(hash) {
    logDebug(`Checking hash ${hash}`);
    return new Promise((resolve, reject) => {
        downloadMetaDataFromEthWithHash(hash).then((metaData) => {
            // metadata: link, name

            metaData.filePath = getFullPathForFileName(metaData.name);
            // metadata: link, name, filePath

            return checkExistence(metaData.filePath).then((isExisting) => {
                return [metaData, isExisting];
            }).catch(() => {
                // checkExistance returns an error if file does not exist
                return [metaData, false];
            });
        }).then(([metaData, isExisting]) => {
            // winston.debug(`File ${metaData.name} is existing: ${isExisting}`);
            if (!isExisting) {
                resolve([metaData, 'unprotected']);
            } else {
                prepareFileDataForFiles(metaData.filePath).then((fileData) => {
                    // filedata: filename, filehash

                    logDebug(`Comparing hashes for ${fileData.fileName}: ${fileData.fileHash} vs ${hash}`);

                    const fileStatus = (fileData.fileHash === hash ? 'protected' : 'faulty');
                    logDebug(`File ${fileData.fileName} status: ${fileStatus}`);
                    metaData.hash = hash;

                    resolve([metaData, fileStatus]);
                })
            }
        }).catch(err => {
            reject(err);
        });
    });
}

function getUnencryptedFilePathInAppFolder(fileName) {
    const unencryptedFileName = getUnencryptedFileName(fileName);
    return new Promise((resolve, reject) => {
        const path = `${FILE_DIR}/${unencryptedFileName}`;
        checkExistence(path).then((isExisting) => {
            winston.debug(`${unencryptedFileName} ${isExisting ? 'does' : 'does not'} exists in ${FILE_DIR}`);
            resolve(path);
        }).catch(err => {
            winston.debug(`${unencryptedFileName} not in ${FILE_DIR}`);
            resolve(null);
        });
    })
}

export { uploadLocalFilesToDropbox, encryptAndUploadFileToDropbox, synchronizeUserFiles, startEthereum, getFileHashesFromEth, uploadLocalFileMetaDataToEth, getFileFromDropboxToFileDir, synchronizeAllFiles, getUnencryptedFilePathInAppFolder, getHashForFile, downloadMetaDataFromEthWithHash, prepareFileDataForFiles, getFullPathForFileName, checkFileByHash };
