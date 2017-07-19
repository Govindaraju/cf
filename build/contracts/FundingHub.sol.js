var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("FundingHub error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("FundingHub error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("FundingHub contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of FundingHub: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to FundingHub.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: FundingHub not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "default": {
    "abi": [
      {
        "constant": false,
        "inputs": [
          {
            "name": "_id",
            "type": "uint256"
          }
        ],
        "name": "withdraw",
        "outputs": [
          {
            "name": "successful",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "getProjectCount",
        "outputs": [
          {
            "name": "length",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_id",
            "type": "uint256"
          },
          {
            "name": "_name",
            "type": "bytes32"
          },
          {
            "name": "_amountToBeRaised",
            "type": "uint256"
          },
          {
            "name": "_deadline",
            "type": "uint256"
          }
        ],
        "name": "createProject",
        "outputs": [
          {
            "name": "successful",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_index",
            "type": "uint256"
          }
        ],
        "name": "getProjectAt",
        "outputs": [
          {
            "name": "id",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_id",
            "type": "uint256"
          }
        ],
        "name": "contribute",
        "outputs": [
          {
            "name": "successful",
            "type": "bool"
          }
        ],
        "payable": true,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_id",
            "type": "uint256"
          }
        ],
        "name": "getAmountRaisedSofar",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_id",
            "type": "uint256"
          }
        ],
        "name": "getProjectState",
        "outputs": [
          {
            "name": "state",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_id",
            "type": "uint256"
          }
        ],
        "name": "getProject",
        "outputs": [
          {
            "name": "id",
            "type": "uint256"
          },
          {
            "name": "name",
            "type": "bytes32"
          },
          {
            "name": "amountToBeRaised",
            "type": "uint256"
          },
          {
            "name": "totalAmount",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [],
        "payable": false,
        "type": "constructor"
      }
    ],
    "unlinked_binary": "0x606060405234610000575b5b5b610a348061001b6000396000f300606060405236156100725763ffffffff60e060020a6000350416632e1a7d4d81146100775780633bcff3b01461009b57806367358a49146100ba578063b108365a146100e7578063c1cbbca714610109578063d906eba014610128578063e01557141461014a578063f0f3f2c81461016c575b610000565b34610000576100876004356101a2565b604080519115158252519081900360200190f35b34610000576100a861022d565b60408051918252519081900360200190f35b3461000057610087600435602435604435606435610234565b604080519115158252519081900360200190f35b34610000576100a860043561031b565b60408051918252519081900360200190f35b610087600435610341565b604080519115158252519081900360200190f35b34610000576100a86004356103d0565b60408051918252519081900360200190f35b34610000576100a8600435610438565b60408051918252519081900360200190f35b346100005761017c6004356104b6565b604080519485526020850193909352838301919091526060830152519081900360800190f35b600081815260208181526040808320548151830184905281517f51cff8d9000000000000000000000000000000000000000000000000000000008152600160a060020a0333811660048301529251929091169283926351cff8d992602480820193929182900301818887803b156100005760325a03f115610000575050604051519250505b50919050565b6001545b90565b600083338484604051610467806105a2833901938452600160a060020a03909216602084015260408084019190915260608301919091525190819003608001906000f08015610000576000868152602081905260409020805473ffffffffffffffffffffffffffffffffffffffff1916600160a060020a03929092169190911790556001805480820180835582818380158290116102f7576000838152602090206102f79181019083015b808211156102f357600081556001016102df565b5090565b5b505050916000526020600020900160005b5086905550600190505b949350505050565b6000600182815481101561000057906000526020600020900160005b505490505b919050565b600081815260208181526040808320548151830184905281517f23024408000000000000000000000000000000000000000000000000000000008152600160a060020a0333811660048301529251929091169283926323024408923492602480830193919282900301818588803b156100005761235a5a03f11561000057505060405151935050505b50919050565b6000818152602081815260408083205481518301849052815160e060020a639b0d53030281529151600160a060020a0390911692639b0d5303926004808201939182900301818787803b156100005760325a03f115610000575050604051519150505b919050565b600081815260208181526040808320548151830184905281517f499586110000000000000000000000000000000000000000000000000000000081529151600160a060020a03909116926349958611926004808201939182900301818787803b156100005760325a03f115610000575050604051519150505b919050565b600081815260208190526040808220548151820183905281517fd2786ba40000000000000000000000000000000000000000000000000000000081528251849384938493600160a060020a0390911692839263d2786ba4926004808201939182900301818887803b156100005760325a03f11561000057505060408051805160209182018051600091829052845160e060020a639b0d530302815294519299509750600160a060020a0386169450639b0d5303936004808201949392918390030190829087803b156100005760325a03f115610000575050604051518796509250505b50919350919356006060604052346100005760405160808061046783398101604090815281516020830151918301516060909301519092905b60408051608081018252858152600160a060020a038516602082018190529181018490524283016060909101819052600086905560018054600160a060020a03191690921790915560028390556003556005805460ff191690555b505050505b6103c88061009f6000396000f300606060405236156100675763ffffffff60e060020a60003504166323024408811461006c578063499586111461009457806351cff8d9146100b357806363bd1d4a146100e05780639b0d530314610101578063d2786ba414610120578063fa89401a14610146575b610000565b610080600160a060020a0360043516610173565b604080519115158252519081900360200190f35b34610000576100a1610216565b60408051918252519081900360200190f35b3461000057610080600160a060020a036004351661022d565b604080519115158252519081900360200190f35b3461000057610080610268565b604080519115158252519081900360200190f35b34610000576100a16102de565b60408051918252519081900360200190f35b346100005761012d6102e5565b6040805192835260208301919091528051918290030190f35b3461000057610080600160a060020a03600435166102f0565b604080519115158252519081900360200190f35b600080808060055460ff1660048111610000571461019057610000565b349150600082116101a057610000565b600160a060020a038416600090815260066020526040902080548301905560048054830190556003544211156101e6576005805460ff191660021790556001925061020e565b60025460045410610208576005805460ff19166001179055610206610268565b505b5b600192505b5b5050919050565b60055460009060ff16600481116100005790505b90565b60015460009033600160a060020a03908116911614156102565761024f610268565b9050610262565b61024f826102f0565b90505b5b919050565b600060018060055460ff1660048111610000571461028557610000565b600154600454604051600160a060020a0390921691600081818185876185025a03f192505050156102c6576005805460ff19166003179055600191506102d8565b6005805460ff19166004179055600091505b5b5b5090565b6004545b90565b6000546002545b9091565b60008060028060055460ff1660048111610000571461030e57610000565b600160a060020a0384166000908152600660205260408120549250821161033457610000565b600160a060020a03841660008181526006602052604080822082905551849181818185876185025a03f19250505015610370576001925061020e565b600160a060020a0384166000908152600660205260408120839055925061020e565b5b5b5b50509190505600a165627a7a723058200b3704145e7ba430b91f763a76d67f47fadf52c40968a64fdc45bbd0082cc49c0029a165627a7a7230582023eb5e711d384483e5b42465024eaeb957b10f7060c530ead763dfad2afebf540029",
    "events": {},
    "updated_at": 1500238729112,
    "links": {},
    "address": "0x95c6dc81f4da444d26b4455cd0571f851974a290"
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "FundingHub";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.FundingHub = Contract;
  }
})();
