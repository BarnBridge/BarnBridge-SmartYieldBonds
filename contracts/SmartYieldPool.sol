// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

// @TODO:
import "hardhat/console.sol";

import "./lib/math/Math.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./compound-finance/CTokenInterfaces.sol";
import "./Model/Bond/IBondSlippageModel.sol";
import "./Model/Token/ITokenPriceModel.sol";

import "./SeniorBondToken.sol";
import "./ISmartYieldPool.sol";

contract SmartYieldPool is ISmartYieldPool, ReentrancyGuard {
    //using SafeMath16 for uint16;
    using SafeMath for uint256;
    using Math for uint256;

    using Counters for Counters.Counter;

    uint256 public constant BLOCKS_PER_YEAR = 2102400;
    uint256 public constant BLOCKS_PER_DAY = BLOCKS_PER_YEAR / 365;
    uint256 public constant BOND_LIFE_MAX = 365 * 2; // in days
    uint256 public constant DAYS_IN_YEAR = 365;

    // DAI
    IERC20 public underlying;
    // cDAI
    CErc20Interface public cToken;
    // COMP
    IERC20 public rewardCToken;

    // senior BOND NFT
    SeniorBondToken public seniorBondToken;

    IBondSlippageModel public seniorModel;
    ITokenPriceModel public juniorModel;

    // @TODO:
    uint256 public feePercent = (10**18 * 1) / 1000; // 0.1%

    struct PoolState {
        uint256 underlyingBondsPrincipal; // amount sent to provider
        uint256 underlyingBondsTotal; // amount locked in bonds to be paid out
        uint256 underlyingJuniors; // amount added by juniors
        uint256 underlyingPoolFees; // amount locked in fees
        // underlying yield(profit) = underlyingTotal - underlyingBondsTotal - underlyingJuniors - underlyingPoolFees
    }

    PoolState public poolState;

    // senior BONDs
    struct SeniorBond {
        uint256 principal;
        uint256 gain;
        uint256 issuedAt;
        uint256 maturesAt;
    }

    Counters.Counter private _seniorBondIds;

    // bond id => bond (SeniorBond)
    mapping(uint256 => SeniorBond) public seniorBond;

    // /senior BONDs

    constructor(
        address _cToken,
        address _rewardCToken,
        address _juniorModel,
        address _seniorModel
    ) public {
        cToken = CErc20Interface(_cToken);
        underlying = IERC20(cToken.underlying());
        rewardCToken = IERC20(_rewardCToken);
        juniorModel = ITokenPriceModel(_juniorModel);
        seniorModel = IBondSlippageModel(_seniorModel);
    }

    function setup(address _seniorBondToken, address _juniorToken) public {
        // @TODO:
        seniorBondToken = SeniorBondToken(_seniorBondToken);
    }

    /**
     * @notice Purchase a senior bond with principalAmount underlying for forEpochs
     * @dev
     */
    function buyBond(uint256 principalAmount, uint16 forDays)
        external
        override
        nonReentrant
        returns (uint256)
    {
        uint256 _ratePerDay = this.bondRate(
            principalAmount,
            forDays
        );

        require(
            principalAmount <= underlying.allowance(msg.sender, address(this)),
            "SmartYieldPool: buyBond not enought allowance"
        );

        underlying.transferFrom(msg.sender, address(this), principalAmount);
        underlying.approve(address(cToken), principalAmount);

        require(
            0 == cToken.mint(principalAmount),
            "SmartYieldPool: buyBond cToken mint failed"
        );

        require(
            0 < forDays && forDays <= BOND_LIFE_MAX,
            "SmartYieldPool: buyBond forDays invalid"
        );

        return
            mintBond(
                msg.sender,
                principalAmount,
                _ratePerDay,
                block.timestamp,
                forDays
            );
    }

    function redeemBond(uint256 _bondId) external override nonReentrant {
        require(
            block.timestamp > seniorBond[_bondId].maturesAt,
            "SmartYieldPool: redeemBond not matured"
        );

        require(
            0 == cToken.redeemUnderlying(seniorBond[_bondId].gain),
            "SmartYieldPool: redeemBond redeemUnderlying failed"
        );

        underlying.transfer(
            seniorBondToken.ownerOf(_bondId),
            seniorBond[_bondId].gain
        );

        poolState.underlyingBondsPrincipal = poolState
            .underlyingBondsPrincipal
            .sub(seniorBond[_bondId].principal);
        poolState.underlyingBondsTotal = poolState.underlyingBondsTotal.sub(
            seniorBond[_bondId].gain
        );

        delete seniorBond[_bondId];
        seniorBondToken.burn(_bondId);
    }

    function getBond(uint256 _bondId)
        public
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (
            seniorBond[_bondId].principal,
            seniorBond[_bondId].gain,
            seniorBond[_bondId].issuedAt,
            seniorBond[_bondId].maturesAt
        );
    }

    function buyToken(uint256 _underlying) external override nonReentrant {
        uint256 toReceive = this.getsTokens(_underlying);

        require(
            _underlying <= underlying.allowance(msg.sender, address(this)),
            "SmartYieldPool: buyToken allowance"
        );

        underlying.transferFrom(msg.sender, address(this), _underlying);
        underlying.approve(address(cToken), _underlying);

        poolState.underlyingJuniors = poolState.underlyingJuniors.add(
            _underlying
        );

        require(
            0 == cToken.mint(_underlying),
            "SmartYieldPool: buyBond cToken mint failed"
        );

        juniorToken.mint(msg.sender, toReceive);
    }

    function sellToken(uint256 _juniorTokens, uint256 _minUnderlying)
        external
        override
        nonReentrant
    {
        uint256 toReceive = this.getsUnderlying(_juniorTokens);
        require(
            _minUnderlying <= toReceive,
            "SmartYieldPool: sellToken min required"
        );

        require(
            _juniorTokens <= juniorToken.balanceOf(msg.sender),
            "SmartYieldPool: sellToken balance required"
        );

        juniorToken.burn(msg.sender, _juniorTokens);

        require(
            0 == cToken.redeemUnderlying(toReceive),
            "SmartYieldPool: sellToken redeemUnderlying failed"
        );

        poolState.underlyingJuniors = poolState.underlyingJuniors.sub(
            toReceive
        );

        underlying.transfer(msg.sender, toReceive);
    }

    // unsafe: does not check liquidity
    function lockFeeFor(uint256 _underlyingFeeable) internal {
        poolState.underlyingPoolFees = poolState.underlyingPoolFees.add(
            this.feeFor(_underlyingFeeable)
        );
    }

    function mintBond(
        address to,
        uint256 principal,
        uint256 ratePerDay,
        uint256 startingAt,
        uint16 forDays
    ) internal returns (uint256) {
        uint256 bondId = _seniorBondIds.current();
        _seniorBondIds.increment();

        uint256 maturesAt = startingAt.add(uint256(1 days).mul(forDays));
        uint256 gain = bondGain(principal, ratePerDay, forDays);
        uint256 fee = this.feeFor(principal);

        require(gain.sub(principal).add(fee) <= this.underlyingLiquidity());
        lockFeeFor(principal);

        seniorBond[bondId] = SeniorBond(principal, gain, startingAt, maturesAt);

        poolState.underlyingJuniors = poolState.underlyingJuniors.sub(
            poolState.underlyingBondsTotal.sub(
                poolState.underlyingBondsPrincipal
            )
        );

        poolState.underlyingBondsPrincipal = poolState
            .underlyingBondsPrincipal
            .add(principal);

        poolState.underlyingBondsTotal = poolState.underlyingBondsTotal.add(
            gain
        );

        seniorBondToken.mint(to, bondId);
        return bondId;
    }

    function feeFor(uint256 _underlyingFeeable)
        external
        override
        view
        returns (uint256)
    {
        return _underlyingFeeable.mul(feePercent).div(10**18);
    }

    function bondGain(
        uint256 principalAmount,
        uint256 ratePerDay,
        uint16 forDays
    ) public pure returns (uint256) {
        return Math.compound(principalAmount, ratePerDay, forDays);
    }

    /**
     * @notice computes the bondRate per block takeing into account the slippage
     * @return (the bondRate after slippage)
     */
    function bondRate(
        uint256 principalAmount,
        uint16 forDays
    ) external override view returns (uint256) {
        // @TODO: formula + COPM valuation
        return
            seniorModel.slippage(address(this), principalAmount, forDays);
    }

    /**
     * @notice current total underlying balance, without accruing interest
     */
    function underlyingTotal() external override view returns (uint256) {
        return
            cToken
                .balanceOf(address(this))
                .mul(cToken.exchangeRateStored())
                .div(10**18);
    }

    /**
     * @notice current underlying liquidity, without accruing interest
     */
    function underlyingLiquidity() external override view returns (uint256) {
        return
            this.underlyingTotal() -
            poolState.underlyingBondsTotal -
            poolState.underlyingPoolFees;
    }

    function underlyingJunior() external override view returns (uint256) {
        return poolState.underlyingJuniors;
    }

    function claimTokenTotal() external override view returns (uint256) {
        return cToken.balanceOf(address(this));
    }

    function ratePerDay() external override view returns (uint256) {
        return cToken.supplyRatePerBlock().mul(BLOCKS_PER_DAY);
    }

    function getsUnderlying(uint256 _juniorTokenAmount)
        external
        view
        returns (uint256)
    {
        return
            _juniorTokenAmount.mul(10**18).div(
                juniorModel.price(
                    this.underlyingJunior(),
                    juniorToken.totalSupply()
                )
            );
    }

    function getsTokens(uint256 _underlyingAmount)
        external
        view
        returns (uint256)
    {
        return
            _underlyingAmount
                .mul(
                juniorModel.price(
                    this.underlyingJunior(),
                    juniorToken.totalSupply()
                )
            )
                .div(10**18);
    }
}
