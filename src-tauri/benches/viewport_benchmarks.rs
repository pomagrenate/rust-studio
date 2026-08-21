use criterion::{black_box, criterion_group, criterion_main, Criterion};
use pomai_studio_lib::viewport::ViewportManager;

fn bench_viewport_operations(c: &mut Criterion) {
    let mut group = c.benchmark_group("Viewport (Virtualized Layout Engine)");

    // 1. Compute viewport lines for 100,000 line document at scroll_top = 50,000px
    let mut vp_large = ViewportManager::new(100_000, 20.0, 1080.0);
    vp_large.scroll_top = 50_000.0;

    group.bench_function("viewport_get_data_100k_lines", |b| {
        b.iter(|| {
            black_box(vp_large.get_viewport_data());
        });
    });

    // 2. Compute line index from Y pixel coordinate (direct math)
    group.bench_function("viewport_line_at_y_calculation", |b| {
        b.iter(|| {
            black_box(vp_large.line_at_y(black_box(523_420.5)));
        });
    });

    group.finish();
}

criterion_group!(benches, bench_viewport_operations);
criterion_main!(benches);
