export type UCOSMode='auto'|'local'|'peer'|'remote';
export interface UCOSManifest{id:string;name:string;version:string;capabilities:string[];runtime:'sandbox'|'system';entry:string;singleton?:boolean;lifecycle?:{suspendable?:boolean;restore?:boolean;autoRestart?:boolean};}
export interface CapabilityOptions{operation?:string;args?:unknown;mode?:UCOSMode;targetNodeId?:string;resourceScope?:string;signal?:AbortSignal|null;timeoutMs?:number;}
export interface VFSStat{path:string;name:string;kind:'file'|'directory';size?:number;type?:string;}
export interface WorkflowRunOptions{signal?:AbortSignal|null;timeoutMs?:number;}
export interface UCOSSDK{
 readonly manifest:UCOSManifest;readonly pid:string|null;
 capability:{request(capabilityId:string,options?:CapabilityOptions):Promise<unknown>};
 vfs:{stat(path:string):Promise<VFSStat>;list(path:string):Promise<VFSStat[]>;mkdir(path:string,options?:{recursive?:boolean}):Promise<unknown>;readText(path:string):Promise<string>;writeText(path:string,text:string):Promise<unknown>;remove(path:string,options?:{recursive?:boolean}):Promise<unknown>;copy(from:string,to:string):Promise<unknown>;move(from:string,to:string):Promise<unknown>;health():Promise<unknown>};
 workflows:{run(flow:unknown,input?:unknown,options?:WorkflowRunOptions):Promise<unknown>};
 runtime:{health():Promise<unknown>;heartbeat():Promise<unknown>;onLifecycle(handler:(event:{state:string;reason?:string;time:number})=>void):()=>void;on(type:'apps-changed'|'process-state'|'process-stale',handler:(detail:unknown)=>void):()=>void};
}
declare global{interface Window{UCOS:UCOSSDK;UCOSApp?:((root:HTMLElement,sdk:UCOSSDK)=>unknown)|{mount(root:HTMLElement,sdk:UCOSSDK):unknown;onSuspend?(event:unknown):unknown;onResume?(event:unknown):unknown;onCrash?(event:unknown):unknown;}}}
export {};