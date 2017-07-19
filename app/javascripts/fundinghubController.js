var app = angular.module('fundinghub', []);

app.config(function ($locationProvider) {
  $locationProvider.html5Mode(true);
});

var getTransactionReceiptMined = function (txnHash, interval) {
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
      console.log("error "+e);
      reject(e);
    }
  };

  return new Promise(function (resolve, reject) {
      transactionReceiptAsync(txnHash, resolve, reject);
  });
};

app.controller("fundinghubController", [ '$scope', '$location', '$http', '$q', '$window', '$timeout', function($scope , $location, $http, $q, $window, $timeout) {

  $scope.projects = [];
  
  $scope.contribute = function(id, contribution){

    console.log("id = "+id);
    console.log("contribution = "+contribution);
    var fundinghub = FundingHub.deployed();

     fundinghub.contribute(
        id, 
        {from : accounts[0], value : contribution, gas: 3000000})
      .then(function (tx) {
        return getTransactionReceiptMined(tx);
       })
      .then(function (receipt) {
        console.log("Contribution accepted ");
        setStatus("Contribution accepted ");
      })
      .catch(function (e) {
        console.error(e);
      });
  };

  $scope.createProject = function(id,name,amountToBeRaised,deadline){
    console.log("id "+id+" name "+name+" amountToBeRaised "+amountToBeRaised+" deadline "+deadline);

    var fundinghub = FundingHub.deployed();

    fundinghub
      .createProject(
        id,
        name,
        amountToBeRaised,
        deadline,
        { from: account, gas: 3000000 })
      .then(function (tx) {
        return getTransactionReceiptMined(tx);
      })
      .then(function (receipt) {
        console.log("Project added");
        setStatus("Project added ");
        addProject(id);
      })
      .catch(function (e) {
        console.error(e);
      });
  };

  $scope.collectProjects = function(){
    var fundinghub = FundingHub.deployed();

    console.log("collect project called ");
    fundinghub.getProjectCount()
      .then(function (count) {
        if (count.valueOf() > 0) {
          for (var i = 0; i < count.valueOf(); i++) {
            fundinghub.getProjectAt(i)
              .then(function (id) {
                return fundinghub.getProject(id.valueOf())
                  .then(function (values) {
                    $timeout(function () {
                      $scope.projects.push({
                        id: values[0].valueOf(),
                        name: web3.toAscii(values[1]).replace(/\u0000/g, ''),
                        amountToBeRaised: values[2].valueOf(),
                        amountRaisedSoFar: values[3].valueOf()
                      });
                    });
                  })
                  .catch(function (e) {
                    console.error(e);
                  });
              })
              .catch(function (e) {
                console.error(e);
              });
          }
        }
      });
  };

function addProject(_id) {
    var fundinghub = FundingHub.deployed();

    fundinghub.getProject(_id)
        .then(function (values) {
          $timeout(function () {
            $scope.projects.push({
              id: values[0].valueOf(),
              name: web3.toAscii(values[1]).replace(/\u0000/g, ''),
              amountToBeRaised: values[2].valueOf(),
              amountRaisedSoFar: values[3].valueOf()
            });
          });
        });
};

function setStatus(message) {
  var status = document.getElementById("status");
  status.innerHTML = '<font color="green">'+message+'</font>';
};

window.onload = function() {
    web3.eth.getAccounts(function(err, accs) {
        if (err != null) {
          setStatus("There was an error fetching your accounts.");
          return;
        }

        if (accs.length == 0) {
          setStatus("Couldn't get any accounts! Make sure your Ethereum client is configured correctly.");
          return;
        }
          accounts = accs;
          account = accounts[0];
          $scope.collectProjects();
          setStatus("account loaded "+account);
      });
    }

}]);



