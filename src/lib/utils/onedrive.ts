/**
 * Converts a OneDrive share link to a direct download/embed link.
 * 
 * Supports:
 * - 1drv.ms shortlinks
 * - onedrive.live.com links (personal)
 * - my.sharepoint.com links (business/school) - *Note: Subject to auth, might not work publicly*
 * 
 * @param url The OneDrive share URL
 * @returns The direct link string, or null if not a valid/convertible OneDrive URL
 */
export const getOneDriveDirectLink = (url: string): string | null => {
    if (!url) return null;

    try {
        const urlObj = new URL(url);
        
        // 1. Handle "1drv.ms" shortlinks
        // Example: https://1drv.ms/i/s!Am... or https://1drv.ms/u/s!Am...
        // These often redirect, but appending ?download=1 usually forces the file content.
        if (urlObj.hostname === '1drv.ms') {
            // Simply appending query param might not work directly for embed tags without following redirect,
            // but for many cases ?resized=1 or ?download=1 works if the client follows it.
            // However, 1drv.ms usually redirects to onedrive.live.com.
            // Let's try a standard approach: replace query params with download=1
            // But often for <img> tags we need the final URL. 
            // Since we can't follow redirects easily in client-side JS without CORS issues,
            // we will try appending `?download=1`.
            
             // Create a new URL object to avoid mutating the original if we needed to keep it
             const newUrl = new URL(url);
             newUrl.searchParams.set('download', '1');
             return newUrl.toString();
        }

        // 2. Handle "onedrive.live.com" links
        // Personal OneDrive
        // Example: https://onedrive.live.com/?authkey=%21...&cid=...&id=...
        // or https://onedrive.live.com/embed?cid=...&resid=...&authkey=...
        if (urlObj.hostname.includes('onedrive.live.com')) {
             // If it's already an embed link, just ensuring it has dimensions isn't strictly necessary for a raw 'src',
             // but often 'embed' endpoint returns an HTML page unless we want the raw file.
             // The most reliable way for Personal OneDrive is to change 'embed' or 'view' to 'download' 
             // OR use the `?resid=...&authkey=...` params with `export=download`.
             
             // Strategy: Replace 'redir' or 'view.aspx' or 'embed' with 'download' is unsafe as paths vary.
             // Safer strategy for Personal: Append `&authkey=...&em=2` (for embed) or use `?download=1`.
             // `?download=1` is the universal "give me the file" for OneDrive web viewer.
             
             const newUrl = new URL(url);
             newUrl.searchParams.set('download', '1');
             return newUrl.toString();
        }

        // 3. Handle SharePoint / OneDrive for Business "my.sharepoint.com"
        // Example: https://tenant-my.sharepoint.com/:i:/g/personal/user_org/E...
        // These are tricky because they often require authentication or are "guest" links.
        // If it's a public link, appending `?download=1` usually works.
        if (urlObj.hostname.endsWith('sharepoint.com')) {
             const newUrl = new URL(url);
             newUrl.searchParams.set('download', '1');
             return newUrl.toString();
        }

    } catch {
        return null;
    }

    return null;
};
