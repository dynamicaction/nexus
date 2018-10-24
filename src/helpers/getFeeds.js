// This helper handles a route request for
// GET /sankey/data/getFeeds
//
// On success it returns JSON representation of the feedOutputs.yaml file

const asyncHandler = require('express-async-handler')
const feedOutputsSchema = require('/opt/nexus/src/validations/feedOutputs.json');
var readYaml = require('read-yaml-promise');
var Ajv = require('ajv');
var ajv = new Ajv({allErrors: true});
require('ajv-async')(ajv);

module.exports = asyncHandler(async (req, res, next) => {
  //Read in the YAML file
  var feedOutputs = await readYaml('/opt/nexus/config/feedOutputs.yaml');

  //Validation of the YAML file to ensure no errors
  var validate = ajv.compile(feedOutputsSchema);
  var validateResults = validate(feedOutputs);

  //If our feedOutputs.yaml doesn't pass validation
  if(! validateResults) {
    //Build and throw an error on the request
    let errString = 'The feed outputs file fails validation:<br>';
    validate.errors.forEach(function(errorItem) {
      errString = errString + '<br>' + errorItem.dataPath + ' ' + errorItem.message;
    });
    let err = new Error(errString);
    //We still set status to 200 to prevent express from eating the error. All error
    //reporting is done on the client side.
    err.status = 200;
    return next(err);
  }

  //Everything was good so return the JSON
  res.json(feedOutputs);
  next();
});