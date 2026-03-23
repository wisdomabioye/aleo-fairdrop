// @ts-nocheck
import {
  Account,
  ProgramManager,
  PrivateKey,
  initThreadPool,
  AleoKeyProvider,
  AleoNetworkClient,
  NetworkRecordProvider,
} from '@provablehq/sdk';
import { expose, proxy } from 'comlink';

await initThreadPool();

async function localProgramExecution(program, aleoFunction, inputs) {
  const programManager = new ProgramManager();
  const account = new Account();
  programManager.setAccount(account);
  const executionResponse = await programManager.run(program, aleoFunction, inputs, false);
  return executionResponse.getOutputs();
}

async function getPrivateKey() {
  const key = new PrivateKey();
  return proxy(key);
}

async function getMappingValue(networkUrl, programId, mapping, key) {
  const client = new AleoNetworkClient(networkUrl);
  const value = await client.getProgramMappingValue(programId, mapping, key);
  return value ? String(value) : null;
}

async function getBlockHeight(networkUrl) {
  const client = new AleoNetworkClient(networkUrl);
  const height = await client.getLatestHeight();
  return Number(height);
}

const workerMethods = {
  localProgramExecution,
  getPrivateKey,
  getMappingValue,
  getBlockHeight,
};

expose(workerMethods);
