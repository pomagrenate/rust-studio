use tauri::State;
use crate::codewiki::graph::CodeGraphState;
use crate::codewiki::indexer::CodeWikiIndexer;
use crate::codewiki::types::{
    WikiPage, SymbolNode, BlastRadiusReport, GraphData, CodeWikiStats
};

#[tauri::command]
pub async fn build_code_wiki_index(
    workspace_path: String,
    state: State<'_, CodeGraphState>,
) -> Result<CodeWikiStats, String> {
    let mut graph = state.write();
    CodeWikiIndexer::index_workspace(&mut graph, &workspace_path)
}

#[tauri::command]
pub async fn get_code_wiki_page(
    symbol_id: String,
    state: State<'_, CodeGraphState>,
) -> Result<WikiPage, String> {
    let graph = state.read();
    graph.get_wiki_page(&symbol_id).ok_or_else(|| "Symbol not found".to_string())
}

#[tauri::command]
pub async fn get_code_wiki_graph(
    state: State<'_, CodeGraphState>,
) -> Result<GraphData, String> {
    let graph = state.read();
    Ok(graph.get_graph_data())
}

#[tauri::command]
pub async fn search_code_wiki_symbols(
    query: String,
    state: State<'_, CodeGraphState>,
) -> Result<Vec<SymbolNode>, String> {
    let graph = state.read();
    Ok(graph.search_symbols(&query))
}

#[tauri::command]
pub async fn get_code_wiki_blast_radius(
    symbol_id: String,
    state: State<'_, CodeGraphState>,
) -> Result<BlastRadiusReport, String> {
    let graph = state.read();
    Ok(graph.compute_blast_radius(&symbol_id))
}
