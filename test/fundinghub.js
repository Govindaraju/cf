web3.eth.getTransactionReceiptMined = function (txnHash, interval) {
  var transactionReceiptAsync;
  interval = interval ? interval : 500;
  transactionReceiptAsync = function(txnHash, resolve, reject) {
    try {
      var receipt = web3.eth.getTransactionReceipt(txnHash);
      if (receipt == null) {
        setTimeout(function () {
          transactionReceiptAsync(txnHash, resolve, reject);
        }, interval);
      } else {
        resolve(receipt);
      }
    } catch(e) {
      reject(e);
    }
  };

  return new Promise(function (resolve, reject) {
      transactionReceiptAsync(txnHash, resolve, reject);
  });
};

/*
Every prorject created in thei FundingHub expires after the configured deadline in minutes.
This sleep function is a utility function in this test suite to simulate expiry.
*/
function sleepForMilliSeconds(millis)
{
    var date = new Date();
    var curDate = null;
    do { curDate = new Date(); }
    while(curDate-date < millis);
}

/*
	Please note, we have made it in such a way in this test suite that
	accounts[0] - will be the fundraiser 
	accounts[1] - will be the contributor
*/
contract("FundingHub",function(accounts){
	it("should start with an auto created project by the migration script ", function(){
		var fundingHub = FundingHub.deployed();

		return fundingHub.getProjectCount.call()
			.then (function(count){
				assert.equal(count.valueOf(),1,"there should be one auto created project in the hub");
			});
	});

	/*
		Invoker of the contract should be able to add a new project.
		Verify :
			Project gets added
			Project attributes are set as expected.
		Note : bytes32 to string conersion is accompolished in here. 
	*/

	it("should be able to add a new project ",function(){
		var fundingHub = FundingHub.deployed();		

		return fundingHub.createProject.call(1,"SMT",100,120)
			.then(function(successful){
				assert.isTrue(successful,"Project should have got added");
				return fundingHub.createProject(1,"SMT",100,120);
			})
			.then(function(tx) {
		    	return Promise.all([
		    		web3.eth.getTransactionReceiptMined(tx)
	    			]);
	    	})
			.then(function (eventAndReceipt) {
		    	return fundingHub.getProjectCount.call();
		    })
			.then(function(count){
				assert.equal(2,count.valueOf(),"now there should now be two projects in the hub");
				return fundingHub.getProjectAt.call(0);
			})
			.then(function(id){
				assert.equal(1, id.valueOf(),"retrieved id should be 1");
				return fundingHub.getProject.call(1);
			})
			.then(function(values){
			
				assert.equal(1,values[0].valueOf());
				assert.equal("SMT",web3.toAscii(values[1]).replace(/\u0000/g, ''),"this should be SMT"); 
				assert.equal(100, values[2].valueOf(),"this should be amountToBeRaised");
				assert.equal(0, values[3],"this should be the fund raised so far");
			});
	});

	/*
		Verrify : One is able to contribute to any of the active projects. 
	*/

	it("should be able to fund the project within deadline",function(){
			var fundingHub = FundingHub.deployed();
			
			return fundingHub.createProject(1,"SMT",100,120)
			.then(function(tx) {
		    	return Promise.all([
		    		web3.eth.getTransactionReceiptMined(tx)
	    			]);
	    	})
			.then(function (eventAndReceipt) {
				return fundingHub.contribute.call(1, {value : 5});	
		    })
			.then(function(successful){
				assert.isTrue(successful,"should have accepted contribution");
			});
	});

	/*
		When a project reaches its deadline without achieving the target amount, then 
		we allow the contributors to withdraw their contribution.

		Verrify : A contributor is able to withdraw his contribution when the project
		breaches the deadline.
	*/

	it("should not accept contribution if deadline breached ",function(){
			var fundingHub = FundingHub.deployed();

			return fundingHub.createProject(2000,"SMT",100,0)
			.then(function(tx) {
		    	return Promise.all([
		    		web3.eth.getTransactionReceiptMined(tx)
	    			]);
	    	})
			.then(function (eventAndReceipt) {
				return fundingHub.getProjectState.call(2000);
		    })
		    .then(function(state){
		    	assert.equal(0, state.valueOf(),"project state should be 0 (State.FundBeingAccepted) ");
		    	return fundingHub.getAmountRaisedSofar.call(2000);
		    })
		    .then (function(amount){
		    	assert.equal(0,amount.valueOf(), "amountRaisedSofar must be 0 now ");
		    	sleepForMilliSeconds(1000);
		    	return fundingHub.contribute(2000, {value : 5});	
		    })
		    .then(function(tx){
		    	return Promise.all([
		    		web3.eth.getTransactionReceiptMined(tx)
	    			]);
		    })
			.then(function (eventAndReceipt) {
				return fundingHub.getProjectState.call(2000);
		    })
			.then(function(state){
				assert.equal(2, state.valueOf(),"project state should be 2 (State.DeadlineBreached)");
				return fundingHub.getAmountRaisedSofar.call(2000);
			})
		    .then (function(amount){
		    	assert.equal(5,amount.valueOf(), "amountRaisedSofar must be 5 ");
				return fundingHub.contribute(2000, {value : 4});							
		    })
		    .then(function(value){
		    	assert(false, "An exception should have occured here..");
		    })
		    .catch(function(error){
		    });
	 });

	/*
		Payout to the fund raiser must happen automatically, when the target amount is collected.

		Verify : the payout is done when the target amount is reached.
	*/
	it("should accept contribution till the target is reacched and then should transfer the fund to the fund raiser ",function(){
			var fundingHub = FundingHub.deployed();
			var balBefore = web3.eth.getBalance(accounts[0]);

			// create a project which inteds to collect 10 ethers, will remain active for 1000 seconds
			return fundingHub.createProject(2000,"SMT",10,1000)
			.then(function(tx) {
		    	return Promise.all([
		    		web3.eth.getTransactionReceiptMined(tx)
	    			]);
	    	})
			.then(function (eventAndReceipt) {
				fundingHub.contribute(2000, {value : 4});
				fundingHub.contribute(2000, {value : 5});
				return fundingHub.getAmountRaisedSofar.call(2000);
		    })
		    .then(function(amount){
				assert.equal(9,amount.valueOf(), "amountRaisedSofar must be 9 ");	
				fundingHub.contribute(2000, {value : 1});
				return fundingHub.getProjectState.call(2000);
		    })
			.then(function(state){
				assert.equal(3, state.valueOf(),"project state should be 3 (State.payoutDone)");
			});    
	 });

	/*
		Idea 
		account[0] = fundraiser
		account[1] = contributor
		amountToBeRaised = 10
		deadline = 1 second
		
		1. contributor contributes 5 
		2. Sleeps for 2 seconds
		3. Verify : Contributor is be able to withdraw
	*/
	it("should allow contributor to withdraw fund when the deadline is breached",function(){
		var fundingHub = FundingHub.deployed();

		return fundingHub.createProject(2000,"SMT",10,1)
		.then(function(tx) {
	    	return Promise.all([
	    		web3.eth.getTransactionReceiptMined(tx)
    			]);
    	})
		.then(function (eventAndReceipt) {
			fundingHub.contribute.call(2000, {from : accounts[1], value : 1});
	    	sleepForMilliSeconds(2000);
			fundingHub.contribute(2000, {from : accounts[1], value : 1});	
			return fundingHub.getProjectState.call(2000);  
	    })
	    .then(function(state){
			assert.equal(2, state.valueOf(),"project state should be 2 (State.DeadlineBreached)");
			return fundingHub.withdraw.call(2000,{from : accounts[1]});  	
	    })	
	    .then(function(successful){
			assert.isTrue(successful,"should be able to withdraw fund");
	    });

	});

});
	
