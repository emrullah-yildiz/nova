// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { installSaveLoad } from '../src/app/save-load.js';

it('dbg2', async () => {
  document.body.innerHTML = '<div id="landing-page" class="active"></div><div id="workspace-page"></div>';
  const client = {
    redeemShareLink: async () => ({ project: { id: 'prj1' } }),
    getProject: async () => ({ id:'prj1', name:'P', currentVersionId:'v1', versions:[{id:'v1',graph:{nodes:[],wires:[]}}] }),
  };
  const app = { currentPage:'landing', _cloudProjectId:null, currentUser:{email:'a'}, _aiMessages:[], nodes:[], wires:[], selectedNodes:[], zoom:1,panX:0,panY:0,nextNodeId:1, signIn:()=>{}, renderRecentProjects:()=>{}, renderNode:()=>{}, escapeHtml:s=>String(s==null?'':s) };
  app.addAIMessage = (...a)=>{ app._aiMessages.push(a); };
  app.newProject = () => { console.log('NEWPROJECT, before _cloudProjectId=', app._cloudProjectId); app.currentPage='workspace'; };
  installSaveLoad(app);
  app._novaCloudClient = client;
  const origSave = app._saveCloudProjectId;
  app._saveCloudProjectId = (id) => { console.log('SAVEID called id=', id, 'before=', app._cloudProjectId); origSave(id); console.log('SAVEID after=', app._cloudProjectId); };
  await app.redeemShareToken('tok');
  console.log('FINAL cloudId=', app._cloudProjectId, 'msgs=', JSON.stringify(app._aiMessages));
  expect(app._cloudProjectId).toBe('prj1');
});
