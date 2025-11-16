const mongoose = require('mongoose');
const { Readable } = require('stream');

let articleImagesBucket;
let avatarsBucket;

const getBucket = (bucketName = 'articleImages') => {
  const connection = mongoose.connection;

  if (!connection || !connection.db) {
    throw new Error('MongoDB connection is not ready for GridFS');
  }

  if (bucketName === 'articleImages') {
    if (!articleImagesBucket) {
      articleImagesBucket = new mongoose.mongo.GridFSBucket(connection.db, {
        bucketName: 'articleImages'
      });
    }
    return articleImagesBucket;
  }

  if (bucketName === 'avatars') {
    if (!avatarsBucket) {
      avatarsBucket = new mongoose.mongo.GridFSBucket(connection.db, {
        bucketName: 'avatars'
      });
    }
    return avatarsBucket;
  }

  throw new Error(`Unknown bucket name: ${bucketName}`);
};

const uploadFile = (file, bucketName = 'articleImages') => new Promise((resolve, reject) => {
  try {
    const bucketInstance = getBucket(bucketName);
    const filename = `${Date.now()}-${file.originalname}`;

    const uploadStream = bucketInstance.openUploadStream(filename, {
      contentType: file.mimetype,
      metadata: {
        originalName: file.originalname
      }
    });

    Readable.from(file.buffer)
      .pipe(uploadStream)
      .on('error', (error) => reject(error))
      .on('finish', () => {
        resolve({
          _id: uploadStream.id,
          filename,
          contentType: uploadStream.options?.contentType || file.mimetype,
          length: uploadStream.length ?? file.size,
          uploadDate: uploadStream.uploadDate
        });
      });
  } catch (error) {
    reject(error);
  }
});

const deleteFile = async (fileId, bucketName = 'articleImages') => {
  if (!fileId) {
    return;
  }

  const bucketInstance = getBucket(bucketName);
  await bucketInstance.delete(new mongoose.Types.ObjectId(fileId));
};

const getFileStream = (fileId, bucketName = 'articleImages') => {
  const bucketInstance = getBucket(bucketName);
  return bucketInstance.openDownloadStream(new mongoose.Types.ObjectId(fileId));
};

module.exports = {
  getBucket,
  uploadFile,
  deleteFile,
  getFileStream
};
