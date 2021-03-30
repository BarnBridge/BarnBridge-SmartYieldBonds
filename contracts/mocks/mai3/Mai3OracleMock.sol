import "./../../external-interfaces/mai3/IMai3Oracle.sol";

contract Mai3OracleMock is IMai3Oracle {
    bool public _isTerminated;
    uint256 public _newTimestamp;
    int256 public _newPrice;

    function isTerminated() external view override returns (bool) {
        return _isTerminated;
    }

    function priceTWAPShort() external view override returns (int256 newPrice, uint256 newTimestamp) {
        return (_newPrice, _newTimestamp);
    }

    function setIsTerminated(bool isTerminated_) external {
        _isTerminated = isTerminated_;
    }

    function setNewTimestamp(uint256 newTimestamp_) external {
        _newTimestamp = newTimestamp_;
    }

    function setNewPrice(int256 newPrice_) external {
        _newPrice = newPrice_;
    }
}
