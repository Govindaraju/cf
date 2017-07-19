pragma solidity ^0.4.8;

import "Project.sol";

contract FundingHub {
	
	mapping(uint => Project) private projects;
	uint[] private ids;
	
	function FundingHub(){
	}

	function createProject(uint _id, bytes32 _name, uint _amountToBeRaised, uint _deadline) 
			returns(bool successful) {
		projects[_id] = new Project(_name,msg.sender,_amountToBeRaised,_deadline);
		ids.push(_id);
		return true;
	}

	function contribute(uint _id) payable returns (bool successful){
		Project project = Project(projects[_id]);
		return project.fund.value(msg.value)(msg.sender);
	}

	function withdraw(uint _id) returns(bool successful) {
		Project project = Project(projects[_id]);
		return project.withdraw(msg.sender);
	}

	function getProjectCount() constant returns (uint length) {
		return ids.length;	
	}

	function getProjectAt(uint _index) 
			constant
			returns (uint id) {
				return ids[_index];
	}

	function getProject(uint _id)
		constant
		returns(uint256 id,
		bytes32 name,
		uint256 amountToBeRaised,
		uint256 totalAmount){

		Project project = projects[_id];
		(name,amountToBeRaised) = project.getMetaData();
		totalAmount = project.getAmountRaisedSofar();

		return (
			_id,
			name,
			amountToBeRaised,
			totalAmount
		);
	}

	function getProjectState(uint _id) returns(uint state) {
		return projects[_id].getProjectState();	
	}

	function getAmountRaisedSofar(uint _id) constant returns(uint256) {
		return projects[_id].getAmountRaisedSofar();	
	}

}