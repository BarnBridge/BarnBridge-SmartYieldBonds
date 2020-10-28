// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./lib/math/Exponential.sol";
import "./lib/math/SafeMath16.sol";
import "./compound-finance/CTokenInterfaces.sol";

import "./SeniorBondToken.sol";

contract SmartYieldPool is ReentrancyGuard, Exponential {
    using SafeMath16 for uint16;
    using SafeMath for uint256;
    using Counters for Counters.Counter;

    uint256 public constant BLOCKS_PER_YEAR = 2102400;
    uint256 public constant BLOCKS_PER_EPOCH = BLOCKS_PER_YEAR / 365;
    uint256 public constant EPOCH_LEN = 1 days;
    uint16 public constant BOND_LIFE_MAX_EPOCHS = 365; // ~ 6mo

    // DAI
    IERC20 public underlying;
    // cDAI
    CErc20Interface public cToken;
    // COMP
    IERC20 public rewardCToken;

    uint256 underlyingLoaned;

    // senior BONDs
    struct SeniorBond {
        uint256 principal;
        uint256 gain;
        uint256 issuedAtBlock;
        uint16 maturesAt;
    }

    SeniorBondToken public seniorBondToken;

    Counters.Counter private _seniorBondIds;

    // bond id => bond data (SeniorBond)
    mapping(uint256 => SeniorBond) public seniorBond;
    // senior BONDs

    // junior POOL tokens
    IERC20 public juniorPoolToken;

    constructor(address _cToken, address _rewardCToken) public {
        cToken = CErc20Interface(_cToken);
        underlying = IERC20(cToken.underlying());
        rewardCToken = IERC20(_rewardCToken);
    }

    function setup(address _seniorBondToken, address _juniorPoolToken) public {
        // @TODO:
        seniorBondToken = SeniorBondToken(_seniorBondToken);
        juniorPoolToken = IERC20(_juniorPoolToken);
    }

    /**
     * @notice Purchase a senior bond with principalAmount underlying for forEpochs
     * @dev
     */
    function buyBond(uint256 principalAmount, uint16 forEpochs)
        public
        nonReentrant
    {
        require(
            0 < forEpochs && forEpochs <= BOND_LIFE_MAX_EPOCHS,
            "SmartYieldPool: buyBond forEpochs has to be 0 < forEpochs <= BOND_LIFE_MAX_EPOCHS"
        );
        require(
            underlying.allowance(msg.sender, address(this)) >= principalAmount,
            "SmartYieldPool: buyBond not enought allowance"
        );

        underlying.transferFrom(msg.sender, address(this), principalAmount);
        underlying.approve(address(cToken), principalAmount);

        require(
            cToken.mint(principalAmount) == 0,
            "SmartYieldPool: failed to mint cToken"
        );

        underlyingLoaned = underlyingLoaned.add(principalAmount);

        uint256 bondId = _seniorBondIds.current();
        _seniorBondIds.increment();

        uint16 maturesAtEpoch = uint16(currentEpoch()).add(forEpochs);
        uint256 ratePerBlock = bondRatePerBlockSlippage(principalAmount);
        seniorBond[bondId] = SeniorBond(
            principalAmount,
            ratePerBlock,
            block.number,
            maturesAtEpoch
        );
    }

    function currentEpoch() public view returns (uint16) {
        block.number / BLOCKS_PER_EPOCH + 1;
    }

    function bondGain(
        uint256 principalAmount,
        uint256 ratePerBlock,
        uint16 forEpochs
    ) public view returns (uint256) {
        uint256 ratePerEpoch = ratePerBlock * BLOCKS_PER_EPOCH;
        return compound(principalAmount, ratePerEpoch, forEpochs);
    }

    /**
     * @notice computes the bondRate per block takeing into account the slippage
     * @return (the bondRate after slippage)
     */
    function bondRatePerBlockSlippage(uint256 addedPrincipalAmount)
        public
        view
        returns (uint256)
    {
        // @TODO: formula + COPM valuation
        return cToken.supplyRatePerBlock();
    }

    /**
     * @notice current total underlying balance, without accruing interest
     */
    function underlyingTotal() public view returns (uint256) {
        return
            cToken
                .balanceOf(address(this))
                .mul(cToken.exchangeRateStored())
                .div(1e18);
    }

    function claimTokenTotal() public view returns (uint256) {
        return cToken.balanceOf(address(this));
    }

    function compound(
        uint256 principal,
        uint256 epochRate,
        uint16 epochs
    ) public pure returns (uint256) {
        // from https://medium.com/coinmonks/math-in-solidity-part-4-compound-interest-512d9e13041b
        epochs -= 1;
        while (epochs > 0) {
            principal += (principal * epochRate) / 10**18;
            epochs -= 1;
        }
        return principal;
    }
}
