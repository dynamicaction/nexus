const asyncHandler = require('express-async-handler')
const feedFlowSchema = require('/opt/nexus/src/validations/feedFlow.json');
const feedOutputsSchema = require('/opt/nexus/src/validations/feedOutputs.json');
const fragInputsSchema = require('/opt/nexus/src/validations/fragInputs.json');
var readYaml = require('read-yaml-promise');
var Ajv = require('ajv');
var ajv = new Ajv({allErrors: true});
require('ajv-async')(ajv);

module.exports = asyncHandler(async (req, res, next) => {
  const feedFlows = await readYaml('/opt/nexus/config/' + req.params.feedid + '.yaml');
  const fragInputs = await readYaml('/opt/nexus/config/fragInputs.yaml');
  const feedOutputs = await readYaml('/opt/nexus/config/feedOutputs.yaml');

  var validate = ajv.compile(feedFlowSchema);
  var validateResults = validate(feedFlows);

  if(! validateResults) {
    let errString = 'The feed flow file fails validation:<br>';
    validate.errors.forEach(function(errorItem) {
      errString = errString + '<br>' + errorItem.dataPath + ' ' + errorItem.message;
    });
    let err = new Error(errString);
    //console.log(validate.errors);
    err.status = 200;
    return next(err);
  }

  validate = ajv.compile(feedOutputsSchema);
  validateResults = validate(feedOutputs);

  if(! validateResults) {
    let errString = 'The feed outputs file fails validation:<br>';
    validate.errors.forEach(function(errorItem) {
      errString = errString + '<br>' + errorItem.dataPath + ' ' + errorItem.message;
    });
    let err = new Error(errString);
    //console.log(validate.errors);
    err.status = 200;
    return next(err);
  }

  validate = ajv.compile(fragInputsSchema);
  validateResults = validate(fragInputs);

  if(! validateResults) {
    let errString = 'The frag inputs file fails validation:<br>';
    validate.errors.forEach(function(errorItem) {
      errString = errString + '<br>' + errorItem.dataPath + ' ' + errorItem.message;
    });
    let err = new Error(errString);
    //console.log(validate.errors);
    err.status = 200;
    return next(err);
  }

  var nodes = [];
  var links = [];
  var flowData = {};
  flowData['flowInfo'] = {};
  //Assign numerical values to all of our nodes
  var nodeValueCounter = 0;
  for (var flowIndex in feedFlows['flows']) {
    var flow = feedFlows['flows'][flowIndex];
    for (var flowInputIndex in flow.flowInputs) {
      var flowInput = flow.flowInputs[flowInputIndex];
      if (! flowData.flowInfo.hasOwnProperty(flowInput)) {
        flowData['flowInfo'][flowInput]={};
        flowData['flowInfo'][flowInput]['nodeValue'] = nodeValueCounter;
        nodes.push({name: flowInput});
        //If my flowInput is a fragment I can already place a weight on it
        for (var fragInputIndex in fragInputs['fragInputs']) {
          if (flowInput == fragInputs['fragInputs'][fragInputIndex]['id']) {
            flowData['flowInfo'][flowInput]['html']=getFragmentHTML(flowInput);
            flowData['flowInfo'][flowInput]['flowhtml']=getFragmentFlowHTML(flowInput);
            if (fragInputs['fragInputs'][fragInputIndex]['isCore'] == true) {
              flowData['flowInfo'][flowInput]['weight'] = 6;
            } else {
              flowData['flowInfo'][flowInput]['weight'] = 1;
            }
          }
        }
        nodeValueCounter++;
      }
    }
    if (! flowData.flowInfo.hasOwnProperty(flow.flowId)) {
      flowData['flowInfo'][flow.flowId]={};
      flowData['flowInfo'][flow.flowId]['nodeValue'] = nodeValueCounter;
      nodes.push({name: flow.flowId});
      nodeValueCounter++;
    }
  }

  //Assign weights to the flows based on inputs.
  //Core fragments have a weight of 30
  //Mapping fragments have a weight of 10

  var haveAllWeights = false;
  var iterations = 1;
  var missingCalcs = [];
  while (iterations <= 100 && haveAllWeights === false) {
    //console.log('Starting Iteration:' + iterations);
    missingCalcs = [];
    //Assume we have them all until we dont
    haveAllWeights = true;
    //console.log(feedFlows['flows']);
    for (flowIndex in feedFlows['flows']) {
      flow = feedFlows['flows'][flowIndex]
      var flowId = flow['flowId'];
      var weight = 0;
      var allInputsHaveWeights = true;
      for (flowInputIndex in flow['flowInputs']) {
        flowInput = flow['flowInputs'][flowInputIndex];
        //console.log(flowId + ' has ' + flowInput + ' at  (' + flowInputIndex + ')');
        if (flowData['flowInfo'][flowId].hasOwnProperty('weight')) {
          allInputsHaveWeights = true;
        } else {
          //We need to try to calculate the weight if possible
          //Does my flowInput even have a weight
          if(flowData['flowInfo'][flowInput].hasOwnProperty('weight')) {
            //console.log(flowId + ' has weight of ' + weight);
            weight = weight + flowData['flowInfo'][flowInput]['weight'];
            //console.log(flowId + ' has new weight of ' + weight);
          } else {
            //console.log('Not enough info to calculate the weight for ' + flowId + '( Missing: ' + flowInput + ' )');
            missingCalcs.push('Not enough info to calculate the weight for ' + flowId + '( Missing: ' + flowInput + ' )');
            allInputsHaveWeights = false;
            haveAllWeights = false;
          }
        }
      }
      if (allInputsHaveWeights === true &&
       ! flowData['flowInfo'][flowId].hasOwnProperty('weight')) {
        //console.log('Calculated wieght for ' + flowId + ' (' + weight + ')');
        flowData['flowInfo'][flowId]['weight'] = weight;
        flowData['flowInfo'][flowId]['flowhtml'] = getFlowHTML(flowId);
        flowData['flowInfo'][flowId]['html'] = '';
      }
    }
    iterations++;
    if (iterations >= 100) {
      let err = new Error('There is a cycle in the graph or you are missing frag input entries:<br><br>' + missingCalcs.join('<br>'));
      err.status = 200;
      return next(err);
    }
  }
  //console.log(flowData);
  //Build the nodes and links
  feedFlows['flows'].forEach(function(flow) {
    flow['flowInputs'].forEach(function(flowInput) {
      //{"source":0,"target":1,"value":10},
      var link = {};
      link.source=flowData['flowInfo'][flowInput]['nodeValue'];
      link.target=flowData['flowInfo'][flow['flowId']]['nodeValue'];
      link.value=flowData['flowInfo'][flowInput]['weight'];
      links.push(link);
    });
  });

  flowData.nodes = nodes;
  flowData.links = links;
  flowData.feedName = feedFlows.feedJobName;
  flowData.feedOutput = feedFlows.feedOutput;

  res.json(flowData);
  next();

  function getFragmentHTML(fragment) {

    var fragmentHTML = '';
    fragInputs['fragInputs'].forEach(function(fragInput) {
      if (fragment === fragInput['id']) {
        fragmentHTML = '<p>' + fragInput['description'] + '</p>';
        fragmentHTML = fragmentHTML + '<p>Below is the schema for this input fragment</p>';
        fragmentHTML = fragmentHTML + '<table class="table table-condensed"><thead><tr><th>Column Name</th><th>Column Type</th></tr></thead>';
        fragInput['schema'].forEach(function(column) {
          fragmentHTML = fragmentHTML + '<tbody><tr><td>' + column['columnName'] + '</td><td>' + column['columnType'] + '</td></tr>';
        });
        fragmentHTML = fragmentHTML + '</tbody></table>';
      }
    });
    return fragmentHTML;
  }

  function getFragmentFlowHTML(fragment) {
    var fragmentHTML = '';
    fragInputs['fragInputs'].forEach(function(fragInput) {
      if (fragment === fragInput['id']) {
        fragmentHTML = fragmentHTML + '<p>Below is the schema output of ' + fragInput['id'] + '</p>';
        fragmentHTML = fragmentHTML + '<table class="table table-condensed"><thead><tr><th>Column Name</th><th>Column Type</th></tr></thead>';
        fragInput['schema'].forEach(function(column) {
          fragmentHTML = fragmentHTML + '<tbody><tr><td>' + column['columnName'] + '</td><td>' + column['columnType'] + '</td></tr>';
        });
        fragmentHTML = fragmentHTML + '</tbody></table>';
      }
    });
    return fragmentHTML;
  }

  function getFlowHTML(flowId) {
    //console.log(flowId);
    var flowHTML = '<p>Below is the schema output of ' + flowId + '</p>';
    flowHTML = flowHTML + '<table class="table table-condensed"><thead><tr><th>Column Name</th><th>Column Type</th></tr></thead>';
    feedFlows['flows'].forEach(function(flow) {
      if(flowId === flow['flowId']) {
        if(flow.hasOwnProperty('schema')) {
          flow['schema'].forEach(function(column) {
            flowHTML = flowHTML + '<tbody><tr><td>' + column['columnName'] + '</td><td>' + column['columnType'] + '</td></tr>';
          });
        }
      }
    });
    return flowHTML;
  }
});