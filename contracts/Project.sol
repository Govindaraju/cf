pragma solidity ^0.4.8;

contract Project {
	
	struct MetaData{

		bytes32 name;
		address fundraiser;
		uint256 amountToBeRaised;
		uint256 deadlineInMinutes;

	}

	enum State {

		FundBeingAccepted,
		TargetAmountCollected,
		DeadlineBreached,
		payoutDone,
		Failed
	}

	MetaData private metaData;
	uint256 private amountRaisedSoFar;
	State private projectSate;
	mapping(address => uint256) contributorAmountMap;

	event LogContributionWithDrawn(address contributor, uint256 amount);

	function Project(bytes32 _name, address _fundraiser, uint256 _amountToBeRaised, uint256 _deadlineInMinutes) {

		metaData = MetaData({
				name : _name,
				fundraiser : _fundraiser,
				amountToBeRaised : _amountToBeRaised,
				deadlineInMinutes : now + (_deadlineInMinutes * 1 seconds)
			});

		projectSate = State.FundBeingAccepted;
	}	

	modifier allowOperation(State allowedState){
		if (projectSate != allowedState) throw;
		_;
	}


	function fund(address _contributor) allowOperation(State.FundBeingAccepted) payable returns(bool successful) {

		var _amountContributed = msg.value ;

		if(_amountContributed <= 0){
			throw;
		}

		contributorAmountMap[_contributor] += _amountContributed;
		amountRaisedSoFar += _amountContributed;
		
		if(now > metaData.deadlineInMinutes) {
			projectSate = State.DeadlineBreached;
			return true;
		} else if (amountRaisedSoFar >= metaData.amountToBeRaised) {
			projectSate = State.TargetAmountCollected;
			payout();
		}
		return true;
	}

	function withdraw(address _contributor) returns(bool successful) {
		if (msg.sender == metaData.fundraiser) {
			return payout();
		} else {
			return refund(_contributor);
		}
	}

	function payout() allowOperation(State.TargetAmountCollected) returns(bool successful) {

		if (metaData.fundraiser.call.value(amountRaisedSoFar)()) {
			projectSate = State.payoutDone;
			return true;
		} else {
			projectSate = State.Failed;
			return false;
		}
	}

	function refund(address _contributor) allowOperation(State.DeadlineBreached) returns(bool successful) {

			uint256 amountToBeRefunded = contributorAmountMap[_contributor];
			if (amountToBeRefunded <= 0) {
				throw ;
			} else {
				contributorAmountMap[_contributor] = 0 ;
				if (_contributor.call.value(amountToBeRefunded)()){ // here try to use msg.sender.call.value
					return true;
				}else {
					contributorAmountMap[_contributor] = amountToBeRefunded;
					return false;
				}
			}
	} 

	function getMetaData() 
		constant
		returns (bytes32 name,
		uint256 amountToBeRaised){
			return (
				metaData.name, 
				metaData.amountToBeRaised
				);
	}

	function getProjectState() constant returns (uint ustate) {
		return uint (projectSate);
	}

	function getAmountRaisedSofar() constant returns (uint256) {
		return amountRaisedSoFar;
	}
}