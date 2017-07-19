pragma solidity ^0.4.8;

contract Owned {
	address owner;

	function Owned(){
		owner = msg.sender;
	}

	modifier onlyOwner() {
		if(msg.sender != owner) throw;
		_;
	}

	function changeOwner(address newOwner) onlyOwner {
		owner = newOwner;
	}
}