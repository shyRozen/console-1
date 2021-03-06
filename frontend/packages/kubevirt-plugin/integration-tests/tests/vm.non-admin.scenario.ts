import { execSync } from 'child_process';
import { browser, ExpectedConditions as until } from 'protractor';
import { appHost, testName } from '@console/internal-integration-tests/protractor.conf';
import * as loginView from '@console/internal-integration-tests/views/login.view';
import {
  withResource,
  removeLeakedResources,
  waitForCount,
  removeLeakableResource,
} from '@console/shared/src/test-utils/utils';
import { isLoaded, resourceRows } from '@console/internal-integration-tests/views/crud.view';
import { restrictedAccessBlock } from '../views/vms.list.view';
import { createProject } from './utils/utils';
import {
  JASMINE_EXTENDED_TIMEOUT_INTERVAL,
  PAGE_LOAD_TIMEOUT_SECS,
} from './utils/constants/common';
import { VM_STATUS, VM_ACTION } from './utils/constants/vm';
import { VMBuilder } from './models/vmBuilder';
import { getBasicVMBuilder } from './mocks/vmBuilderPresets';
import { provisionSources, rootDisk } from './mocks/mocks';

const testNonAdminNamespace = `${testName}-non-admin`;
const KUBEADMIN_IDP = 'kube:admin';
const KUBEADMIN_USERNAME = 'kubeadmin';
const {
  BRIDGE_HTPASSWD_IDP = 'test',
  BRIDGE_HTPASSWD_USERNAME = 'test',
  BRIDGE_HTPASSWD_PASSWORD = 'test',
  BRIDGE_KUBEADMIN_PASSWORD,
} = process.env;

describe('Kubevirt non-admin Flow', () => {
  const leakedResources = new Set<string>();
  const vm = new VMBuilder(getBasicVMBuilder())
    .setProvisionSource(provisionSources.URL)
    .setDisks([rootDisk])
    .build();

  beforeAll(async () => {
    await loginView.logout();
    await loginView.login(BRIDGE_HTPASSWD_IDP, BRIDGE_HTPASSWD_USERNAME, BRIDGE_HTPASSWD_PASSWORD);
    await createProject(testNonAdminNamespace);
    await browser.get(`${appHost}/k8s/ns/${testNonAdminNamespace}/virtualization`);
    await isLoaded();
  });

  afterAll(async () => {
    removeLeakedResources(leakedResources);
    execSync(`kubectl delete project ${testNonAdminNamespace}`);
    await loginView.logout();
    await loginView.login(KUBEADMIN_IDP, KUBEADMIN_USERNAME, BRIDGE_KUBEADMIN_PASSWORD);
  });

  it(
    'ID(CNV-1718) non-admin create and remove a vm',
    async () => {
      await vm.create();
      await withResource(
        leakedResources,
        vm.asResource(),
        async () => {
          await vm.action(VM_ACTION.Start, false); // Without waiting for the VM to be Running
          await vm.waitForStatus(VM_STATUS.Starting); // Just to make sure it is actually starting,
          await vm.action(VM_ACTION.Delete, false);
          await vm.navigateToListView();
          await isLoaded();
          await browser.wait(until.and(waitForCount(resourceRows, 0)), PAGE_LOAD_TIMEOUT_SECS);
        },
        true,
      );
      removeLeakableResource(leakedResources, vm.asResource());
    },
    JASMINE_EXTENDED_TIMEOUT_INTERVAL,
  );

  it('ID(CNV-1720) non-admin cannot create vm in foreign namespace', async () => {
    // Navigate to Virtual Machines page with foreign default namespace
    await browser.get(`${appHost}/k8s/ns/default/virtualmachines`);
    // Check to make sure Access is Restricted.
    await browser.wait(until.textToBePresentInElement(restrictedAccessBlock, 'Restricted Access'));
  });
});
