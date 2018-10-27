const asyncHandler = require('express-async-handler')

//Validation schemas used by ajv module to validate our mistakes
const feedFlowSchema = require('/opt/nexus/src/validations/feedFlow.json');
const feedOutputsSchema = require('/opt/nexus/src/validations/feedOutputs.json');
const fragInputsSchema = require('/opt/nexus/src/validations/fragInputs.json');

//Read a yaml asynchronously
var readYaml = require('read-yaml-promise');

var Ajv = require('ajv');
var ajv = new Ajv({allErrors: true, $data: true});
require('ajv-async')(ajv);
require('ajv-keywords')(ajv);

module.exports = asyncHandler(async (req, res, next) => {
  //Read in our YAML files
  const feedFlows = await readYaml('/opt/nexus/config/' + req.params.feedid + '.yaml');
  const fragInputs = await readYaml('/opt/nexus/config/fragInputs.yaml');
  const feedOutputs = await readYaml('/opt/nexus/config/feedOutputs.yaml');

  //Validate our feed flow schem and throw an error if we fail
  var validate = ajv.compile(feedFlowSchema);
  var validateResults = validate(feedFlows);

  if(! validateResults) {
    let err = validationError('The feed flow file fails validation.', validate.errors);
    return next(err);
  }

  //Validate our feedOutputs schema and throw an error if we fail
  validate = ajv.compile(feedOutputsSchema);
  validateResults = validate(feedOutputs);
  if(! validateResults) {
    let err = validationError('The feed outputs file fails validation', validate.errors);
    return next(err);
  }

  validate = ajv.compile(fragInputsSchema);
  validateResults = validate(fragInputs);
  if(! validateResults) {
    let err = validationError('The frag inputs file fails validation.', validate.errors);
    return next(err);
  }

  var nodes = [];
  var links = [];
  var flowData = {};
  flowData['flowInfo'] = {};

  //Assign numerical values to all of our nodes.
  //This is required for the Sankey diagram
  var nodeValueCounter = 0;
  //loop through all flows of the feed job
  for (var flowIndex in feedFlows['flows']) {
    var flow = feedFlows['flows'][flowIndex];
    //loop through all the flowInputs of each flow
    for (var flowInputIndex in flow.flowInputs) {
      var flowInput = flow.flowInputs[flowInputIndex];
      //this is a new flow input we are discovering. Assign it a nodevalue number
      if (! flowData.flowInfo.hasOwnProperty(flowInput)) {
        flowData['flowInfo'][flowInput]={};
        flowData['flowInfo'][flowInput]['nodeValue'] = nodeValueCounter;
        nodes.push({name: flowInput});
        //If my flowInput is a fragment I can already place a weight on it
        for (var fragInputIndex in fragInputs['fragInputs']) {
          if (flowInput == fragInputs['fragInputs'][fragInputIndex]['id']) {
            flowData['flowInfo'][flowInput]['html']=getFragmentHTML(flowInput);
            flowData['flowInfo'][flowInput]['flowhtml']=getFragmentFlowHTML(flowInput);
            //Core fragments get a weight of 4, non-core of 1
            if (fragInputs['fragInputs'][fragInputIndex]['isCore'] == true) {
              flowData['flowInfo'][flowInput]['weight'] = 4;
            } else {
              flowData['flowInfo'][flowInput]['weight'] = 1;
            }
          }
        }
        //Increment our node value counter for the next discovered node
        nodeValueCounter++;
      }
    }
    //Track that we have found a new flow as well
    if (! flowData.flowInfo.hasOwnProperty(flow.flowId)) {
      flowData['flowInfo'][flow.flowId]={};
      flowData['flowInfo'][flow.flowId]['nodeValue'] = nodeValueCounter;
      flowData['flowInfo'][flow.flowId]['html'] = getFlowLogicHTML(flow.flowId);
      flowData['flowInfo'][flow.flowId]['flowhtml'] = getFlowHTML(flow.flowId);
      nodes.push({name: flow.flowId});
      nodeValueCounter++;
    }
  }

  //The last thing we need to do is put in the final output
  //this is built manually
  flowData['flowInfo'][feedFlows.feedOutput]={};
  flowData['flowInfo'][feedFlows.feedOutput]['nodeValue'] = nodeValueCounter;
  flowData['flowInfo'][feedFlows.feedOutput]['html'] = getFeedOuputHTML(feedFlows.feedOutput);
  flowData['flowInfo'][feedFlows.feedOutput]['flowhtml'] = '';
  nodes.push({name: feedFlows.feedOutput});

  //Assign weights to the flows based on inputs.
  //We already assigned fragment weights above, so assuming
  //no errors or cycles we should be able to calculate all weights
  // of the flows

  var haveAllWeights = false;
  var iterations = 1;
  var missingCalcs = [];

  //I am willing to try 100 times. If we can't do it after that then
  //we probably have a cycle
  while (iterations <= 100 && haveAllWeights === false) {

    missingCalcs = [];
    //Assume we have them all until we dont
    haveAllWeights = true;

    //Loop through our flows
    for (flowIndex in feedFlows['flows']) {
      flow = feedFlows['flows'][flowIndex]
      var flowId = flow['flowId'];
      var weight = 0;
      //Assume we have weights for all inputs until we don't
      //If we do we can easily sum those up to get our weight
      var allInputsHaveWeights = true;
      for (flowInputIndex in flow['flowInputs']) {
        flowInput = flow['flowInputs'][flowInputIndex];

        //We already know the weight of this one, so move on
        if (flowData['flowInfo'][flowId].hasOwnProperty('weight')) {
          allInputsHaveWeights = true;
        } else {
          //We need to try to calculate the weight if possible
          //Does my flowInput even have a weight
          if(flowData['flowInfo'][flowInput].hasOwnProperty('weight')) {
            weight = weight + flowData['flowInfo'][flowInput]['weight'];
          } else {
            //We can't calculate this one yet, so track what's missing
            missingCalcs.push('Not enough info to calculate the weight for ' + flowId + '( Missing: ' + flowInput + ' )');
            allInputsHaveWeights = false;
            haveAllWeights = false;
          }
        }
      }
      //Set a weight if we've just calculated one
      if (allInputsHaveWeights === true &&
       ! flowData['flowInfo'][flowId].hasOwnProperty('weight')) {
        //console.log('Calculated wieght for ' + flowId + ' (' + weight + ')');
        flowData['flowInfo'][flowId]['weight'] = weight;
      }
    }
    iterations++;
    if (iterations >= 100) {
      let err = new Error('There is a cycle in the graph or you are missing frag input entries:<br><br>' + missingCalcs.join('<br>'));
      err.status = 200;
      return next(err);
    }
  }

  //Build we create the links which is just an index value
  //to another index value with the calculated weight
  feedFlows['flows'].forEach(function(flow) {
    flow['flowInputs'].forEach(function(flowInput) {
      var link = {};
      link.source=flowData['flowInfo'][flowInput]['nodeValue'];
      link.target=flowData['flowInfo'][flow['flowId']]['nodeValue'];
      link.value=flowData['flowInfo'][flowInput]['weight'];
      links.push(link);
    });
  });

  //Add the final link
  var finalLink = {};
  finalLink.source=nodeValueCounter -1;
  finalLink.target=nodeValueCounter;
  finalLink.value=flowData['flowInfo'][nodes[nodeValueCounter -1]['name']]['weight'];
  links.push(finalLink);

  //Attach all necessary data to the flowData array
  flowData.nodes = nodes;
  flowData.links = links;
  flowData.feedName = feedFlows.feedJobName;
  flowData.feedOutput = feedFlows.feedOutput;
  flowData.sankeyWidth = feedFlows.sankeyWidth;

  res.json(flowData);
  next();

  //Function that returns HTML content for our fragment input modal
  function getFragmentHTML(fragment) {
    var fragmentHTML = '';
    fragInputs['fragInputs'].forEach(function(fragInput) {
      if (fragment === fragInput['id']) {
        fragmentHTML = '<p><h6>Description:</h6>' + fragInput['description'] + '</p>';
        fragmentHTML = fragmentHTML + '<hr><p><h6>Fragment Schema:</h6></p>';
        fragmentHTML = fragmentHTML + '<div style="padding-left:1em;"><table class="table table-sm" style="font-size:12px;"><thead><tr><th>Column Name</th><th>Column Type</th></tr></thead>';
        fragInput['schema'].forEach(function(column) {
          fragmentHTML = fragmentHTML + '<tbody><tr><td>' + column['columnName'] + '</td><td>' + column['columnType'] + '</td></tr>';
        });
        fragmentHTML = fragmentHTML + '</tbody></table></div>';
        fragmentHTML = fragmentHTML + '<hr><p><h6>Fragment Variations:</h6></p><p style="margin:0;padding-left:1em;">fragDummy_core (dated)</p>'
        fragmentHTML = fragmentHTML + '<p style="margin:0;padding-left:1em;">fragDummy_undated (nodate)</p><p style="margin:0;padding-left:1em;">fragDummy_nodate (nodate)</p>';
        fragmentHTML = fragmentHTML + '<hr><p><h6>Feeds Affected:</h6></p><p style="margin:0;padding-left:1em;">feedMadeUpName</p><p style="margin:0;padding-left:1em;">feedSecondMadeUpName</p>';
        fragmentHTML = fragmentHTML + '<p style="margin:0;padding-left:1em;">feedJustAnotherFeed</p>';
      }
    });
    return fragmentHTML;
  }

  //Function that returns the fragment flow HTML for our fragment flow input modal
  function getFragmentFlowHTML(fragment) {
    var fragmentHTML = '';
    fragInputs['fragInputs'].forEach(function(fragInput) {
      if (fragment === fragInput['id']) {
        fragmentHTML = fragmentHTML + '<p>Below is the schema output of ' + fragInput['id'] + '</p>';
        fragmentHTML = fragmentHTML + '<table class="table table-sm" style="font-size:12px;"><thead><tr><th>Column Name</th><th>Column Type</th></tr></thead>';
        fragInput['schema'].forEach(function(column) {
          fragmentHTML = fragmentHTML + '<tbody><tr><td>' + column['columnName'] + '</td><td>' + column['columnType'] + '</td></tr>';
        });
        fragmentHTML = fragmentHTML + '</tbody></table>';
      }
    });
    return fragmentHTML;
  }

  //Function that returns the normal flow HTML
  function getFlowHTML(flowId) {
    //console.log(flowId);
    var flowHTML = '<p>Below is the schema output of ' + flowId + '</p>';
    flowHTML = flowHTML + '<table class="table table-sm" style="font-size:12px;"><thead><tr><th>Column Name</th><th>Column Type</th></tr></thead>';
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

  //Function that returns the flow logic HTML for our nodes
  function getFlowLogicHTML(flowId) {
    var flowHTML = '';
    feedFlows['flows'].forEach(function(flow) {
      if (flowId === flow['flowId']) {
        flow['flowSteps'].forEach(function(flowStep) {
          switch(flowStep['type']) {
            case 'AGGREGATE':
              flowHTML = flowHTML + '<hr><p>The flow input is aggregated across the following columns:</p>';
              flowHTML = flowHTML + '<div style="padding-top:1em;padding-left:1em;padding-bottom:1em;"><table class="table table-sm" style="font-size:12px;"><thead><tr><th>Column</th></tr></thead>'
              flowStep['logic']['aggregationColumns'].forEach(function(column) {
                flowHTML = flowHTML + '<tr><td>' + column + '</td></tr>';
              });
              flowHTML = flowHTML + '</table></div>'

              if (flowStep['logic'].hasOwnProperty('aggregationOperations')) {
                flowHTML = flowHTML + '<p>With the following operations are applied to their respective column:</p>';
                flowHTML = flowHTML + '<div style="padding-top:1em;padding-left:1em;padding-bottom:1em;"><table class="table table-sm" style="font-size:12px;"><thead><tr><th>Column</th><th>Operation</th></tr></thead>'
                flowStep['logic']['aggregationOperations'].forEach(function(operation) {
                  flowHTML = flowHTML + '<tr><td>' + operation['columnName'] + '</td><td>' + operation['operation'] + '</td></tr>';
                });
                flowHTML = flowHTML + '</table></div>'
              }
              break;
            case 'JOIN':
              break;
            case 'HTML':
              flowHTML = flowHTML + '<hr>' + flowStep['logic'];
              break;
            case 'MARKDOWN':
              break;
            default:
              flowHTML = '<hr><p>No flowSteps have been defined</p>';
          }
        });
      }
    });

    return flowHTML;
  }

  //Function that returns the output logic HTML for our feed job
  function getFeedOuputHTML(feedName) {
    var feedHTML = '';
    feedOutputs['feedOutputs'].forEach(function(feedOutput) {
      if (feedName === feedOutput['id']) {
        feedHTML = '<p><h6>Description:</h6>' + feedOutput['description'] + '</p>';
        feedHTML = feedHTML + '<hr><p><h6>Feed Schema:</h6></p>';
        feedHTML = feedHTML + '<div style="padding-left:1em;"><table class="table table-sm" style="font-size:12px;"><thead><tr><th>Column Name</th><th>Column Type</th></tr></thead>';
        feedOutput['schema'].forEach(function(column) {
          feedHTML = feedHTML + '<tbody><tr><td>' + column['columnName'] + '</td><td>' + column['columnType'] + '</td></tr>';
        });
        feedHTML = feedHTML + '</tbody></table></div>';
      }
    });
    return feedHTML;
  }

  //Just a helper function to help validate some data
  function validationError(errTitle, errors) {
    let errString = errTitle;
    errors.forEach(function(errorItem) {
      errString = errString + '<br>' + errorItem.dataPath + ' ' + errorItem.message;
    });
    let err = new Error(errString);
    err.status = 200;
    return err;
  }
});