import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { actionRequest, displayElapsed, focusService, startRequest } from '../src/focusService.ts';
import { isBrowserTimezone, statisticsService } from '../src/statisticsService.ts';
import { BarChart, DailyActivity, FocusHistory, HabitStreaks, MetricCard } from '../src/components/statistics/Widgets';
import { StatisticsPanel } from '../src/components/statistics/StatisticsPanel';
import type { FocusSession } from '../src/models';

const session: FocusSession={id:1, task_id:null, planned_seconds:1500,duration_seconds:60,elapsed_seconds:90,state:'running',started_at:'2026-11-10T10:00:00Z',ended_at:null,created_at:'2026-11-10T10:00:00Z',version:2};

test('Focus visual: fecha de consulta, pausa y límite sin convertir ticks en minutos registrados',()=>{
    assert.equal(displayElapsed(session,1000,11000),100);
    assert.equal(displayElapsed({...session,state:'paused'},1000,60000),90);
    assert.equal(displayElapsed(session,1000,9999999),1500);
    assert.equal(session.duration_seconds,60);
});

test('Focus: un reintento conserva UUID, operación y versión; no envía duraciones reales',async t=>{
    const request=actionRequest(session,'pause','00000000-0000-4000-8000-000000000001');
    const calls: string[]=[];
    t.mock.method(globalThis,'fetch',async (url:string,options:RequestInit)=>{
        assert.equal(url,'/api/focus/1/pause');
        calls.push(String(options.body));
        return Response.json({session:{...session,state:'paused',duration_seconds:90,version:3},server_time:'2026-11-10T10:01:30Z'});
    });
    for(let i=0;i<2;i++) assert.equal((await focusService.execute(request)).session?.state,'paused');
    assert.equal(calls[0],calls[1]);
    assert.deepEqual(JSON.parse(calls[0]),{request_id:'00000000-0000-4000-8000-000000000001',expected_version:2});
});

test('Focus: inicio y recuperación usan servidor; no almacenamiento de tokens',async t=>{
    const calls:string[]=[];
    t.mock.method(globalThis,'fetch',async(url:string,options:RequestInit)=>{
        calls.push(`${options.method} ${url}`);
        if(options.method==='POST') assert.deepEqual(JSON.parse(String(options.body)),{request_id:'00000000-0000-4000-8000-000000000002',planned_seconds:1500,task_id:3});
        return Response.json({session,server_time:'2026-11-10T10:01:30Z'});
    });
    await focusService.execute(startRequest(1500,3,'00000000-0000-4000-8000-000000000002'));
    assert.equal((await focusService.active()).session?.id,1);
    assert.deepEqual(calls,['POST /api/focus','GET /api/focus/active']);
});

test('estadísticas: consultas acotadas, zona explícita y errores propagados',async t=>{
    assert.equal(isBrowserTimezone('America/Mexico_City'),true); assert.equal(isBrowserTimezone('Not/AZone'),false);
    const calls:string[]=[];
    t.mock.method(globalThis,'fetch',async(url:string)=>{calls.push(url);return Response.json({});});
    await statisticsService.load('2026-11-01','2026-11-30','America/Mexico_City');
    await statisticsService.history('2026-11-01','2026-11-30','America/Mexico_City');
    assert.equal(calls.length,2); assert.match(calls[0],/timezone=America%2FMexico_City/);
    globalThis.fetch=async()=>Response.json({detail:'Inicia sesión'},{status:401});
    await assert.rejects(statisticsService.load('2026-11-01','2026-11-30','UTC'),(e:any)=>e.status===401);
});

test('componentes: métricas y gráficas accesibles utilizan valores recibidos',()=>{
    const card=renderToStaticMarkup(<MetricCard label="Focus confirmado" value="12 min"/>);
    assert.match(card,/12 min/);
    const chart=renderToStaticMarkup(<BarChart title="Planeado" unit="min" values={[{label:'Trabajo',value:60},{label:'Salud',value:0}]}/>);
    assert.match(chart,/role="img"/);assert.match(chart,/Trabajo: 60 min/);assert.match(chart,/width:100%/);
    const days=renderToStaticMarkup(<DailyActivity days={[{day:'2026-11-10',tasks_total:2,tasks_completed:1,tasks_overdue:1,habits_completed:1,habits_expected:2,planned_minutes:60,focus_minutes:12,focus_completed_minutes:10,focus_interrupted_minutes:2}]}/>);
    assert.match(days,/Tareas 1\/2/);assert.match(days,/Focus 12 min/);
});

test('historial: interrumpidas diferentes de completadas; rachas y futuro etiquetados',()=>{
    const history=renderToStaticMarkup(<FocusHistory page={{items:[{...session,state:'cancelled',ended_at:'2026-11-10T10:02:00Z'}],total:1,limit:50,offset:0,server_time:'2026-11-10T10:02:00Z'}} disabled={false} onPage={()=>{}} onDelete={()=>{}}/>);
    assert.match(history,/Interrumpida/);assert.match(history,/Retirar/);
    const habits=renderToStaticMarkup(<HabitStreaks habits={[{id:1,name:'Leer',fulfilled_days:1,expected_days:2,percent:50,current_streak:1,max_streak:1,history:[{day:'2026-11-10',done:true,eligible:true},{day:'2026-11-11',done:false,eligible:false}]}]}/>);
    assert.match(habits,/racha actual 1/);assert.match(habits,/futuro, no evaluado/);
});

test('panel: carga no se presenta como cero actividad confirmada',()=>{
    const html=renderToStaticMarkup(<StatisticsPanel day="2026-11-10" blocked={false} revision={0} onUnauthorized={()=>{}} onBusyChange={()=>{}}/>);
    assert.match(html,/Calculando estadísticas/);
    assert.ok(!html.includes('No hay actividad registrada'));
});
