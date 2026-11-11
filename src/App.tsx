import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { listStoredPhotos, makePhotoId, removePhoto, savePhotos, storageEstimate, updateFavorite, type PhotoRecord } from './db/library';
import { formatBytes, formatDate, inspectImage, isImage } from './lib/images';

type SortMode = 'newest' | 'oldest' | 'name' | 'size';
type ViewMode = 'grid' | 'comfortable' | 'list';
type LibraryPhoto = PhotoRecord & { src: string };

function Icon({ name }: { name: 'grid' | 'search' | 'plus' | 'folder' | 'heart' | 'more' | 'close' | 'image' | 'spark' | 'trash' | 'sort' | 'list' | 'chevron' }) {
  const paths: Record<typeof name, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    folder: <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></>,
    heart: <path d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.6Z"/>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z"/></>,
    trash: <><path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3"/></>,
    sort: <><path d="M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"/></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r=".8"/><circle cx="4" cy="12" r=".8"/><circle cx="4" cy="18" r=".8"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function App() {
  const [photos, setPhotos] = useState<LibraryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [view, setView] = useState<ViewMode>('grid');
  const [section, setSection] = useState<'all' | 'favorites'>('all');
  const [selected, setSelected] = useState<LibraryPhoto | null>(null);
  const [storage, setStorage] = useState({ usage: 0, quota: 0 });
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef(new Set<string>());

  const hydrate = useCallback(async () => {
    setLoading(true);
    try {
      const stored = await listStoredPhotos();
      const loaded: LibraryPhoto[] = stored.map(({ record, blob }) => {
        const src = URL.createObjectURL(blob);
        objectUrls.current.add(src);
        return { ...record, src };
      });
      setPhotos(loaded);
      setStorage(await storageEstimate());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load the local library.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    folderRef.current?.setAttribute('webkitdirectory', '');
    folderRef.current?.setAttribute('directory', '');
    void hydrate();
    return () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, [hydrate]);

  const visible = useMemo(() => {
    const filtered = photos.filter((photo) => {
      if (section === 'favorites' && !photo.favorite) return false;
      const q = query.trim().toLowerCase();
      return !q || photo.name.toLowerCase().includes(q) || photo.relativePath.toLowerCase().includes(q);
    });
    return filtered.sort((a, b) => {
      if (sort === 'oldest') return (a.capturedAt ?? a.modifiedAt) - (b.capturedAt ?? b.modifiedAt);
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'size') return b.size - a.size;
      return (b.capturedAt ?? b.modifiedAt) - (a.capturedAt ?? a.modifiedAt);
    });
  }, [photos, query, section, sort]);

  const importFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(isImage);
    if (!files.length) {
      setNotice('No supported image files were found in that selection.');
      return;
    }
    setImporting(true);
    setProgress({ done: 0, total: files.length });
    setNotice('');
    const batch: Array<{ record: PhotoRecord; blob: Blob }> = [];
    let completed = 0;
    let failed = 0;
    try {
      for (const file of files) {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const id = makePhotoId(file, relativePath);
        try {
          const details = await inspectImage(file, relativePath);
          const record: PhotoRecord = {
            id,
            name: file.name,
            relativePath,
            mime: file.type || 'application/octet-stream',
            size: file.size,
            modifiedAt: file.lastModified || Date.now(),
            addedAt: Date.now(),
            ...details,
            favorite: false,
          };
          batch.push({ record, blob: file });
        } catch {
          failed += 1;
        }
        completed += 1;
        setProgress({ done: completed, total: files.length });
        if (batch.length >= 40) {
          await savePhotos(batch.splice(0));
        }
      }
      if (batch.length) await savePhotos(batch);
      await hydrate();
      setNotice(`${files.length - failed} photo${files.length - failed === 1 ? '' : 's'} added to this device${failed ? ` · ${failed} skipped` : ''}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Import stopped. Your completed batches remain saved.');
      await hydrate();
    } finally {
      setImporting(false);
    }
  };

  const toggleFavorite = async (photo: LibraryPhoto) => {
    const favorite = !photo.favorite;
    await updateFavorite(photo.id, favorite);
    setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, favorite } : item));
    if (selected?.id === photo.id) setSelected({ ...selected, favorite });
  };

  const deletePhoto = async (photo: LibraryPhoto) => {
    if (!window.confirm(`Remove “${photo.name}” from Halation's local library? The original file is not deleted.`)) return;
    await removePhoto(photo.id);
    URL.revokeObjectURL(photo.src);
    objectUrls.current.delete(photo.src);
    setPhotos((current) => current.filter((item) => item.id !== photo.id));
    if (selected?.id === photo.id) setSelected(null);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><span /></div><span>halation</span><small>LOCAL GALLERY</small></div>
        <div className="side-label">LIBRARY</div>
        <button className={`nav-item ${section === 'all' ? 'active' : ''}`} onClick={() => setSection('all')}><Icon name="grid"/><span>All photos</span><b>{photos.length}</b></button>
        <button className={`nav-item ${section === 'favorites' ? 'active' : ''}`} onClick={() => setSection('favorites')}><Icon name="heart"/><span>Favorites</span><b>{photos.filter((p) => p.favorite).length}</b></button>
        <div className="side-bottom">
          <div className="privacy-card"><div className="privacy-icon"><Icon name="spark"/></div><div><strong>Your library stays yours.</strong><p>Photos are stored on this device. No cloud account. No uploads.</p></div></div>
          <div className="storage"><div className="storage-line"><span>LOCAL STORAGE</span><span>{storage.usage ? formatBytes(storage.usage) : '—'}</span></div><div className="storage-track"><i style={{ width: storage.quota ? `${Math.min(100, storage.usage / storage.quota * 100)}%` : '0%' }}/></div></div>
          <div className="version">HALATION · EARLY BUILD 0.1</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Library</span><Icon name="chevron"/><strong>{section === 'all' ? 'All photos' : 'Favorites'}</strong></div>
          <div className="top-actions">
            <label className="searchbox"><Icon name="search"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your photos"/><kbd>⌘ K</kbd></label>
            <button className="import-button" onClick={() => inputRef.current?.click()} disabled={importing}><Icon name="plus"/> Add photos</button>
            <input ref={inputRef} className="hidden-input" type="file" accept="image/*" multiple onChange={(e) => { if (e.target.files) void importFiles(e.target.files); e.currentTarget.value = ''; }}/>
            <input ref={folderRef} className="hidden-input" type="file" accept="image/*" multiple onChange={(e) => { if (e.target.files) void importFiles(e.target.files); e.currentTarget.value = ''; }}/>
          </div>
        </header>

        <section className="content">
          <div className="page-heading"><div><div className="eyebrow">YOUR PERSONAL ARCHIVE</div><h1>{section === 'all' ? 'All photos' : 'Favorites'}<span>{visible.length.toLocaleString()}</span></h1><p>A quieter place for everything you capture.</p></div><button className="folder-button" onClick={() => folderRef.current?.click()}><Icon name="folder"/> Import folder</button></div>

          {importing && <div className="progress-card"><div className="progress-copy"><strong>Adding photos to your library</strong><span>{progress.done.toLocaleString()} / {progress.total.toLocaleString()}</span></div><div className="progress-track"><i style={{ width: `${progress.total ? progress.done / progress.total * 100 : 0}%` }}/></div></div>}
          {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><Icon name="close"/></button></div>}

          <div className="toolbar"><div className="result-label">{query ? `${visible.length} MATCHING PHOTOS` : section === 'all' ? 'YOUR COLLECTION' : 'SAVED FOR LATER'}</div><div className="toolbar-actions"><label className="sort-control"><Icon name="sort"/><select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name</option><option value="size">File size</option></select></label><div className="view-switch" aria-label="View mode"><button className={view === 'grid' ? 'chosen' : ''} onClick={() => setView('grid')} title="Compact grid"><Icon name="grid"/></button><button className={view === 'comfortable' ? 'chosen' : ''} onClick={() => setView('comfortable')} title="Large grid"><Icon name="image"/></button><button className={view === 'list' ? 'chosen' : ''} onClick={() => setView('list')} title="List"><Icon name="list"/></button></div></div></div>

          {loading ? <div className="loading-state"><div className="loader"/><span>Opening your library…</span></div> : visible.length === 0 ? (
            <div className="empty-state"><div className="empty-art"><div className="empty-photo one"/><div className="empty-photo two"/><div className="empty-photo three"><Icon name="image"/></div><div className="empty-spark">✳</div></div><h2>{photos.length ? 'Nothing in this view yet' : 'Your gallery starts here.'}</h2><p>{photos.length ? 'Try another search or switch back to all photos.' : 'Bring in a folder or choose a few photos. They stay on this device.'}</p><div className="empty-actions"><button className="import-button" onClick={() => inputRef.current?.click()}><Icon name="plus"/> Choose photos</button><button className="folder-button" onClick={() => folderRef.current?.click()}><Icon name="folder"/> Choose a folder</button></div></div>
          ) : (
            <div className={`photo-grid ${view}`}>
              {visible.map((photo) => <article className="photo-card" key={photo.id}>
                <button className="photo-open" onClick={() => setSelected(photo)} aria-label={`Open ${photo.name}`}><img src={photo.src} loading="lazy" alt={photo.name}/><span className="photo-hover"><span>{photo.width && photo.height ? `${photo.width} × ${photo.height}` : 'Image'}</span><span>{formatBytes(photo.size)}</span></span></button>
                <div className="photo-meta"><div><strong title={photo.name}>{photo.name}</strong><span>{formatDate(photo.capturedAt ?? photo.modifiedAt)}</span></div><button className={`favorite-button ${photo.favorite ? 'is-favorite' : ''}`} onClick={() => void toggleFavorite(photo)} aria-label={photo.favorite ? 'Remove from favorites' : 'Add to favorites'}><Icon name="heart"/></button></div>
              </article>)}
            </div>
          )}
          <footer className="page-footer"><span>HALATION · PRIVATE BY DESIGN</span><span>{photos.length.toLocaleString()} PHOTOS IN THIS DEVICE LIBRARY</span></footer>
        </section>
      </main>

      {selected && <div className="viewer-backdrop" onClick={() => setSelected(null)}><div className="viewer" onClick={(e) => e.stopPropagation()}><header><div><strong>{selected.name}</strong><span>{formatDate(selected.capturedAt ?? selected.modifiedAt)} · {formatBytes(selected.size)}</span></div><div className="viewer-actions"><button className={selected.favorite ? 'is-favorite' : ''} onClick={() => void toggleFavorite(selected)} aria-label="Toggle favorite"><Icon name="heart"/></button><button onClick={() => void deletePhoto(selected)} aria-label="Remove from library"><Icon name="trash"/></button><button onClick={() => setSelected(null)} aria-label="Close viewer"><Icon name="close"/></button></div></header><div className="viewer-image"><img src={selected.src} alt={selected.name}/></div><div className="viewer-info"><span>{selected.width && selected.height ? `${selected.width} × ${selected.height}` : 'Dimensions unavailable'}</span><span>{selected.mime}</span><span>{selected.relativePath}</span></div></div></div>}
    </div>
  );
}
