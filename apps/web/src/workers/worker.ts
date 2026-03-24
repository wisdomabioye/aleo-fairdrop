//@ts-nocheck
import {
  Account,
  ProgramManager,
  PrivateKey,
  initThreadPool,
  AleoKeyProvider,
  AleoNetworkClient,
  NetworkRecordProvider,
} from "@provablehq/sdk";
import { expose, proxy } from "comlink";

await initThreadPool();

const NETWORK_URL = "https://api.explorer.provable.com/v1";

async function localProgramExecution(program, aleoFunction, inputs) {
  const programManager = new ProgramManager();

  // Create a temporary account for the execution of the program
  const account = new Account();
  programManager.setAccount(account);

  const executionResponse = await programManager.run(
    program,
    aleoFunction,
    inputs,
    false,
  );
  return executionResponse.getOutputs();
}

async function getPrivateKey() {
  const key = new PrivateKey();
  return proxy(key);
}

async function deployProgram(program) {
  const keyProvider = new AleoKeyProvider();
  keyProvider.useCache(true);

  const networkClient = new AleoNetworkClient(NETWORK_URL);

  const account = new Account({
    privateKey: "user1PrivateKey",
  });

  const recordProvider = new NetworkRecordProvider(account, networkClient);

  const programManager = new ProgramManager(
    NETWORK_URL,
    keyProvider,
    recordProvider,
  );

  programManager.setAccount(account);

  const fee = 1.9;
  const tx_id = await programManager.deploy(program, fee);
  return tx_id;
}

async function getMappingValue(programId, mapping, key) {
  const client = new AleoNetworkClient(NETWORK_URL);
  const value = await client.getProgramMappingValue(programId, mapping, key);
  return value ? String(value) : null;
}

async function getBlockHeight() {
  const client = new AleoNetworkClient(NETWORK_URL);
  const height = await client.getLatestHeight();
  return Number(height);
}

async function executeTransition(privateKey, programId, functionName, inputs, fee) {
  const keyProvider = new AleoKeyProvider();
  keyProvider.useCache(true);

  const account = new Account({ privateKey });
  const networkClient = new AleoNetworkClient(NETWORK_URL);
  const recordProvider = new NetworkRecordProvider(account, networkClient);

  const programManager = new ProgramManager(
    NETWORK_URL,
    keyProvider,
    recordProvider,
  );
  programManager.setAccount(account);

  const tx_id = await programManager.execute(
    programId,
    functionName,
    fee,
    false,
    inputs,
  );
  return tx_id;
}

const workerMethods = {
  localProgramExecution,
  getPrivateKey,
  deployProgram,
  getMappingValue,
  getBlockHeight,
  executeTransition,
};
expose(workerMethods);
