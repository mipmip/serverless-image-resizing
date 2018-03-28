'use strict';

const AWS = require('aws-sdk');
const S3 = new AWS.S3({
  signatureVersion: 'v4',
});
const Sharp = require('sharp');

const BUCKET = process.env.BUCKET;
const URL = process.env.URL;
const ALLOWED_DIMENSIONS = new Set();

if (process.env.ALLOWED_DIMENSIONS) {
  const dimensions = process.env.ALLOWED_DIMENSIONS.split(/\s*,\s*/);
  dimensions.forEach((dimension) => ALLOWED_DIMENSIONS.add(dimension));
}

exports.handler = function(event, context, callback) {
  const key = event.queryStringParameters.key;

  const match = key.match(/((\d+|auto)?x(\d+|auto)?\/)?(.+\.(png|jpg|jpeg|tif|tiff|gif|webp))/);
  //const match = key.match(/((\d+)x(\d+))\/(.*)/);

  if (match === null) {
    // URL don't match regexp
    return callback(null, {
      statusCode: '400',
      body: JSON.stringify({
        error: 'Key does not match form: N?xN?/name.[jpeg|jpg|png|tiff|webp]. Not supported image format.'
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  const maxAge = 14 * 24 * 60 * 60
  const dimensions = match[1];
  const width = (match[2] !== undefined) ? parseInt(match[2], 10) : null; //width == null for autoscale
  const height = (match[3] !== undefined) ? parseInt(match[3], 10) : null; //height == null for autoscale
  const originalKey = match[4];
  let originalExtension = match[5];

  if(ALLOWED_DIMENSIONS.size > 0 && !ALLOWED_DIMENSIONS.has(dimensions)) {
    callback(null, {
      statusCode: '403',
      headers: {},
      body: '',
    });
    return;
  }

  S3.getObject({Bucket: BUCKET, Key: originalKey}).promise()
    .then(data => Sharp(data.Body)
      .resize(width, height)
      .toFormat(originalExtension)
      .toBuffer()
    )
    .then(buffer => S3.putObject({
      Body: buffer,
      Bucket: BUCKET,
      ContentType: `image/${originalExtension}`,
      CacheControl: `max-age=${maxAge}`,
      Key: key,
    }).promise()
    )
    .then(() => callback(null, {
      statusCode: '301',
      headers: {'location': `${URL}/${key}`},
      body: '',
    })
    )
    .catch(err => callback(err))
}
