import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowLeft, FileText, Download, X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

const getChangeSummary = (log: any): string => {
    const before = log.before || {};
    const after = log.after || {};
    const ignoreFields = ['id', 'created_at', 'updated_at', 'note', 'is_temporary'];
    const changes: string[] = [];

    // Compare after vs before to find changes
    for (const key of Object.keys(after)) {
        if (ignoreFields.includes(key)) continue;
        const oldVal = before[key] ?? '';
        const newVal = after[key] ?? '';
        if (String(oldVal) !== String(newVal)) {
            changes.push(`${key}: "${oldVal}" → "${newVal}"`);
        }
    }

    if (changes.length === 0) {
        return after.note || 'No detailed changes';
    }
    return changes.join('\n');
};

const AuditLogsPage = () => {
    const { user, isLoading: authLoading } = useAuth();
    if (authLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
    if (!user || user.role !== 'SUPER_ADMIN') return <Navigate to="/" replace />;

    const [searchTerm, setSearchTerm] = useState('');
    const [actionTypeFilter, setActionTypeFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(25);
    const [selectedLog, setSelectedLog] = useState<any>(null);

    const { data: response, isLoading } = useQuery({
        queryKey: ['audit-logs', actionTypeFilter, dateFrom, dateTo, currentPage, itemsPerPage],
        queryFn: async () => {
            const res = await api.get('audit-logs', {
                params: {
                    action_type: actionTypeFilter,
                    date_from: dateFrom,
                    date_to: dateTo,
                    page: currentPage,
                    per_page: itemsPerPage
                }
            });
            return res.data;
        }
    });

    const logs = response?.data || [];
    const totalPages = response?.last_page || 1;
    const totalLogs = response?.total || 0;

    const clearFilters = () => {
        setSearchTerm('');
        setActionTypeFilter('');
        setDateFrom('');
        setDateTo('');
        setCurrentPage(1);
    };

    const hasActiveFilters = searchTerm || actionTypeFilter || dateFrom || dateTo;

    const exportToCSV = async () => {
        toast.info('Export started...');
        try {
            const res = await api.get('audit-logs', {
                params: { action_type: actionTypeFilter, date_from: dateFrom, date_to: dateTo, per_page: 1000 }
            });
            const data = res.data.data;
            if (!data.length) return toast.error('No records to export');

            const headers = ['Timestamp', 'Actor', 'Action', 'Entity Type', 'Entity ID', 'Details'];
            const csvRows = data.map((log: any) => [
                new Date(log.created_at).toLocaleString(),
                log.actor?.name || log.actor_user_id || 'System',
                log.action_type,
                log.entity_type,
                log.entity_id,
                getChangeSummary(log)
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));

            const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + csvRows.join("\n");
            const link = document.createElement("a");
            link.href = encodeURI(csvContent);
            link.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
        } catch (e) {
            toast.error('Export failed');
        }
    };

    const getActionBadge = (action: string) => {
        if (action?.includes('CREATE') || action?.includes('ADD')) return <Badge variant="default" className="bg-green-500">{action}</Badge>;
        if (action?.includes('DELETE') || action?.includes('REJECT')) return <Badge variant="destructive">{action}</Badge>;
        if (action?.includes('UPDATE') || action?.includes('EDIT')) return <Badge variant="secondary">{action}</Badge>;
        if (action?.includes('APPROVE')) return <Badge className="bg-blue-600 hover:bg-blue-700">{action}</Badge>;
        return <Badge variant="outline">{action}</Badge>;
    };

    return (
        <>
            <div className="min-h-screen bg-muted/30 p-3 md:p-4 space-y-4">
                <div className="container mx-auto max-w-7xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-center gap-3 sm:gap-4">
                            <Link to="/">
                                <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
                            </Link>
                            <h1 className="text-xl md:text-2xl font-bold">Audit Logs</h1>
                        </div>
                        <Button onClick={exportToCSV} variant="outline" size="sm" className="gap-2 w-full sm:w-auto">
                            <Download className="h-4 w-4" />
                            <span className="hidden sm:inline">Export CSV</span>
                            <span className="sm:hidden">Export</span>
                        </Button>
                    </div>

                    <Card>
                        <CardContent className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Action Type</label>
                                    <select
                                        value={actionTypeFilter}
                                        onChange={(e) => { setActionTypeFilter(e.target.value); setCurrentPage(1); }}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="">All Actions</option>
                                        <option value="MEMBER_CREATE">MEMBER_CREATE</option>
                                        <option value="MEMBER_UPDATE">MEMBER_UPDATE</option>
                                        <option value="MEMBER_DELETE">MEMBER_DELETE</option>
                                        <option value="ATTENDANCE_LOG">ATTENDANCE_LOG</option>
                                        <option value="APPROVE_ATTENDANCE">APPROVE_ATTENDANCE</option>
                                        <option value="REJECT_ATTENDANCE">REJECT_ATTENDANCE</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">From Date</label>
                                    <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">To Date</label>
                                    <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} />
                                </div>
                            </div>
                            {hasActiveFilters && (
                                <div className="mt-3 flex items-center gap-2">
                                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 gap-1">
                                        <X className="h-3 w-3" /> Clear Filters
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table className="min-w-[920px]">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Timestamp</TableHead>
                                            <TableHead>Actor</TableHead>
                                            <TableHead>Action</TableHead>
                                            <TableHead>Entity</TableHead>
                                            <TableHead>Details</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow><TableCell colSpan={5} className="text-center h-24"><Loader2 className="animate-spin mx-auto h-8 w-8" /></TableCell></TableRow>
                                        ) : logs.length > 0 ? (
                                            logs.map((log: any) => (
                                                <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedLog(log)}>
                                                    <TableCell className="text-xs whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</TableCell>
                                                    <TableCell className="text-sm font-medium">{log.actor?.name || log.actor_user_id || 'System'}</TableCell>
                                                    <TableCell>{getActionBadge(log.action_type)}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">{log.entity_type} #{log.entity_id}</TableCell>
                                                    <TableCell className="text-xs max-w-[200px] truncate">{getChangeSummary(log)}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow><TableCell colSpan={5} className="text-center h-24">No logs found</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                            <div className="p-4 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                <div className="text-sm text-muted-foreground">Page {currentPage} of {totalPages} ({totalLogs} totals)</div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
                <DialogContent className="max-w-[95vw] sm:max-w-2xl">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Audit Log Details</DialogTitle></DialogHeader>
                    {selectedLog && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div><div className="text-xs font-medium text-muted-foreground">Timestamp</div><div className="text-sm">{new Date(selectedLog.created_at).toLocaleString()}</div></div>
                                <div><div className="text-xs font-medium text-muted-foreground">Action</div><div>{getActionBadge(selectedLog.action_type)}</div></div>
                                <div><div className="text-xs font-medium text-muted-foreground">Actor</div><div className="text-sm font-medium">{selectedLog.actor?.name || 'System'}</div></div>
                                <div><div className="text-xs font-medium text-muted-foreground">Entity</div><div className="text-sm">{selectedLog.entity_type} #{selectedLog.entity_id}</div></div>
                            </div>
                            <div><div className="text-xs font-medium text-muted-foreground mb-1">Details</div><div className="bg-muted p-3 rounded-lg text-sm whitespace-pre-wrap break-words">{getChangeSummary(selectedLog)}</div></div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
};

export default AuditLogsPage;
