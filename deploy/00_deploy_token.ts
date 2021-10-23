import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { chainName, displayResult, dim, cyan, green, yellow } from "./utilities/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, getChainId, ethers } = hre;
  const { deploy } = deployments;
  const { token_deployer } = await getNamedAccounts();
  const chainId = parseInt(await getChainId());

  // 31337 is unit testing, 1337 is for coverage
  const isTestEnvironment = chainId === 31337 || chainId === 1337;

  cyan("\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
  cyan("            Yarloo - Deploy");
  cyan("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");

  dim(`network: ${chainName(chainId)} (${isTestEnvironment ? "local" : "remote"})`);
  dim(`deployer: ${token_deployer}`);

  cyan("\nDeploying Token Contract...");

  const tokenDeployResult = await deploy("Yarloo", {
    from: token_deployer,
    args: [],
    skipIfAlreadyDeployed: true,
  });

  displayResult("Yarloo", tokenDeployResult);

  const tokenContract = await ethers.getContractAt("Yarloo", tokenDeployResult.address);
  dim(`Owner: ${token_deployer}`);
  yellow("\nOwner balance:\n" + (await tokenContract.balanceOf(token_deployer)).toString());

  green(`\nDone!`);
};

export default func;
func.tags = ["Token"];
