# Feed Documentation Specification #

----------

This document contains information on how to build the flow of a feed job for documentation purposes. There are three main files that control this information at current and the layout of those three will be discussed in the following sections.

## feedJobNameFlow.yaml ##

This is the main file that holds all logic about a single specific feed job. It is intended that every feed will have one of these files. From this file we are able to easily document the feed processes completely and in various (hopefully flexible) formats.

It is built on the following properties:

- **feedJobName** (required) - The name of the ETL job being mapped in this file.
- **feedOutput** (required) - The name of the feed that the job creates.
- **flows** (required) - An array of `<flow>` objects.
- **sankeyWidth** (optional) - Controls the width of the sankey diagram that is built. Larger feeds need a larger width to look nice. There is a pending todo to automate this option.

#### Flows ####

A flow is a specific portion of a feed job. You can imagine it as having a start input(s), a section of code manipulating these input(s), and output(s). 

A flow consists of four properties:

- **flowId** (required) - A string naming the flow. This should probably be something that makes sense for what that segment of the feed job is doing. We will also want consistency across feed jobs, so we may want to implement a naming convention.
- **flowInputs** (required) - An array of strings which represents the `<flowId>` values that come into this flow. A flow input string can either be the id of a fragment (see section on fragInputs.yaml) or the `<flowId>` of an already defined flow.
- **flowSteps** (required) - An array of `<flowStep>` objects
- **schema** (required) - An array of `<column>` objects that represent the output schema of the flow.

#### Flow Steps ####

A flow step can be thought of as a piece of work that takes action on one more different inputs. They exist generically with an attempt to be versatile so we can describe almost any logic situation. My hope is that we find that to be the case in practice as we augment these.

A flowStep consists of the following properties:

- **type** (required) - AGGREGATE | JOIN | HTML | MARKDOWN
- **logic** (required) - The logic of the flow step. The format of this varies depending on the <type>.
	-  **AGGREGATE**
		-  **aggregationColumns** (required) - The unique columns/dimensions to be aggregated
		-  **aggregationOperations** (required) - The operations/functions to apply to columns being aggregated
	-  **JOIN**
		-  **joinInputs** (required) - The inputs to be joined
		-  **joinColumns** (required) - The columns to be joined from the inputs
		-  **joinOperations** (required) - The mappings that take place with the join
	-  **HTML**|**MARKDOWN** - The <logic> value is simply a string which represents the HTML or MARKDOWN code to display.


#### More Flows or Less Flows With More Flow Steps? ####

I don't know the answer to this currently. I think some cases are easy to determine, but others are more complex. I think most cases will be easy to tell. We should try to find a happy medium between making the graph look overly complicated vs. shoving too much information into the popup modals. Also for complex Talend logic that can more easily be explained in words, it may be better to use the `HTML` or `MARKDOWN` options.

#### Example ####

	---
	# The feed Job Name
	feedJobName: feedItemAttributesV4
	# The feed that is outputted by the job
	feedOutput: feedItemAttributes
	# An array of the flows of the job
	flows:
	  #This is the first part where all fragItemAttributesSegmentValue_*
	  #inputs are aggregated together for deduplication
	  - flowId: fragItemAttributesSegmentValue-Merge
	    flowInputs:
	      - fragItemAttributesSegmentValue
	    #After the code is applied our flow will have these columns
	    schema:
	      - { columnName: idx, columnType: integer }
	      - { columnName: segmentId, columnType: string }
	      - { columnName: value, columnType: string}
	    #The action is an Aggregate where we take the last(value) after
		#aggregating by idx and segmentId
	    flowSteps:
	      - type: "AGGREGATE"
	        logic: 
	          aggregationColumns:
	            - idx
	            - segmentId
	          aggregationOperations:
	            - { columnName: value, operation: last() }
	
	  #This is the first part where all fragItemAttributesSegment_*
	  #inputs are aggregated together for deduplication
	  - flowId: fragItemAttributesSegment-Merge
	    flowInputs:
	      - fragItemAttributesSegment
	    #After the code is applied our flow will have these columns
	    schema:
	      - { columnName: item_id, columnType: string }
	      - { columnName: idx, columnType: integer }
	      - { columnName: segmentId, columnType: string }
	    #The action is an aggregate where we take the last(segmentId) after
		#aggregating by idx and item_id
	    flowSteps:
	      - type: "AGGREGATE"
	        logic: 
	          aggregationColumns:
	            - item_id
	            - idx
	          aggregationOperations:
	            - { columnName: segmentId, operation: last() }
	
	  #This step takes the Segment and SegmentValues fragments, joins them
	  #and maps the item attribute value in
	  - flowId: fragItemAttributesSegmentToValues-Merge
	    flowInputs:
	      - fragItemAttributesSegmentValue-Merge
	      - fragItemAttributesSegment-Merge
	    schema:
	      - { columnName: item_id, columnType: string }
	      - { columnName: idx, columnType: integer }
	      - { columnName: value, columnType: string }
	    #We want to join two inputs across idx and segmentid and then use
		#value when we have a join
	    flowSteps:
	      - type: "JOIN"
	        logic:
	          joinInputs: 
	            - fragItemAttributesSegmentValue-Merge
	            - fragItemAttributesSegment-Merge
	          joinColumns:
	            - idx
	            - segmentId
	          joinOperations:
	            - { columnName: 'value' }
	
	
	  #This is the final aggregation to the feed output. It simply aggregates
	  #the data from the core fragment taking the last value in the event that we
	  #have duplicate item_id and idx records.
	  - flowId: fragItemAttributes-Merge
	    flowInputs:
	      - fragItemAttributesSegmentToValues-Join
	      - fragItemAttributes
	    schema:
	      - { columnName: item_id, columnType: string }
	      - { columnName: idx, columnType: integer }
	      - { columnName: value, columnType: string }
	    flowSteps:
	      - type: "AGGREGATE"
	        logic: 
	          aggregationColumns:
	            - item_id
	            - idx
	          aggregationOperations:
	            - { columnName: value, operation: last() }


## fragInputs.yaml ##

This file is used to define a list of possible input fragments along with their schema, description, etc.

The document holds an array of `<fragInput>` objects. Any fragment that is referenced in this must be a valid fragment listed in configdata-etl in order to pass validation. A fragment needs to only be listed once as it's schema and general description should be the same across any feed job it's passed into.

#### Example ####

		---
		fragInputs:
          ## This is a <fragInput> object
		  - id: fragItemProductLkup
		    description: Mapping fragment that will set the 'productid' field based on a given 'itemid'
		    schema:
			  ## This is a <column> object
		      - { columnName: itemId, columnType: string }
		      ## This is a second <column> object
		      - { columnName: productId, columnType: string }
		  
		  ## This is another <fragInput> object
		  - id: fragOrderLinesPlacedTimestamp
		    description: Mapping fragment that will set the 'placedTimestamp' based on 'orderid'
		    schema:
		      - { columnName: orderId, columnType: string }
		      - { columnname: placedTimestamp, columnType: date }

## feedOutputs.yaml ##

This file is used to define a list of possible output feeds along with their schema, description, etc.

The document holds and array of `<feedOutput>` objects. Any feed that is referenced in this must be a valid feed listed in configdata-etl in order to pass validation.

**Example**

		---
		feedOutputs:
		  ## This is a <feedOutput> object
		  - id: feedDummy
		    description: "Description of the feed and it's purpose"
		    schema:
		      ## This is a <column> object
		      - { columnName: date, columnType: date }
		      ## This is a second <column> object
		      - { columnName: item_id, columnType: string }
		      - { columnName: product_id, columnType: string }
		      - { columnName: quantity, columnType: integer }



## Data Types ##

Below is information on the various types referenced in this document.

----------

####`<feedOutput>`####
- **id** (required) - Contains the id of the feed created (i.e. feedOrderLines, feedProductProperties, etc.)
- **description** (required) - Description of the feed for documentation purposes
- **schema** (required) - An array of `<column>` objects showing the schema of the feed

----------

####`<fragInput>`####

- **id** (required) - Contains the id of the fragment (i.e. fragOrderLines, fragProductProperties, etc.)
- **description** (required) - Description of the behavior of the fragment for documentation purposes
- **schema** (required) - An array of `<column>` objects
- **isCore** (optional) - This is a boolean that defaults to `false`, but can be set to `true` to mark a fragment as a core fragment and ensure it's link weight is higher than mapping fragments

----------

####`<column>`####

- **columnName** (required) - The name of the input column. If this column matches up with a feed column, it should be named the same.
- **columnType** (optional) - The data type for this column. Values must be:
	- boolean
	- date
	- double
	- float
	- integer
	- string

----------

####`<flow`>####

- **flowId** (required) - A string naming the flow. 
- **flowInputs** (required) - An array of strings which represent the "flowId" values that come into this flow. A flow input string can be either the id of a fragment or the name of an already defined flow.
- **flowSteps** (required) - An array of `<flowStep>` objects
- **schema** (required) - An array of `<column>` objects that represent the output schema of the flow.

----------

####`<flowStep`>####

- **type** (required) - JOIN | AGGREGATION | HTML | MARKDOWN
- **logic** (required) - A <string> or <object> depending on the <type> value
	-  **AGGREGATE**
		-  **aggregationColumns** (required) - The unique columns/dimensions to be aggregated
		-  **aggregationOperations** (required) - An array of <flowOperation> objects for the functions on the aggregated columns
	-  **JOIN**
		-  **joinInputs** (required) - An array of inputs to be joined
		-  **joinColumns** (required) - An array of strings representing the column names to join
		-  **joinOperations** (required) - An array of <flowOperation> objects representing the mappings from the join.
	-  **HTML**|**MARKDOWN** - The <logic> value is simply a <string> which represents the HTML or MARKDOWN code to display.
 
----------

####`<flowOperation`>####

- **columnName** (required) - The column name of the column
- **operation** (required) - The operation, function or mapping that affects the column

----------