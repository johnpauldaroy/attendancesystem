import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowLeft, FileText, Clock, User, Download, Search, Filter, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const AuditLogsPage = () => {
    const { user, isLoading: authLoading } = useAuth();
    if (authLoading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
    if (!user || user.role !== 'SUPER_ADMIN') return <Navigate to="/" replace />;

    const [searchTerm, setSearchTerm] = useState('');
    const [actionTypeFilter, setActionTypeFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [selectedLog, setSelectedLog] = useState<any>(null);

    const { data: logs, isLoading } = useQuery({
        queryKey: ['audit-logs'],
        queryFn: async () => {
            const querySnapshot = await getDocs(collection(db, 'audit_logs'));
            const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
            return data.sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
        }
    });

    // Get unique action types for filter
    const actionTypes = useMemo(() => {
        if (!logs) return [];
        const types = new Set(logs.map((log: any) => log.action_type).filter(Boolean));
        return Array.from(types).sort();
    }, [logs]);

    // Filter and search logic
    const filteredLogs = useMemo(() => {
        if (!logs) return [];

        return logs.filter((log: any) => {
            // Search filter
            if (searchTerm) {
                const search = searchTerm.toLowerCase();
                const actorMatch = (log.actor_name || log.actor_user_id || '').toLowerCase().includes(search);
                const entityMatch = (log.entity_id || '').toLowerCase().includes(search);
                if (!actorMatch && !entityMatch) return false;
            }

            // Action type filter
            if (actionTypeFilter && log.action_type !== actionTypeFilter) {
                return false;
            }

            // Date range filter
            if (dateFrom || dateTo) {
                const logDate = log.created_at?.toDate ? log.created_at.toDate() : new Date(log.created_at);
                if (dateFrom && logDate < new Date(dateFrom)) return false;
                if (dateTo) {
                    const endDate = new Date(dateTo);
                    endDate.setHours(23, 59, 59, 999);
                    if (logDate > endDate) return false;
                }
            }

            return true;
        });
    }, [logs, searchTerm, actionTypeFilter, dateFrom, dateTo]);

    // Pagination
    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
    const paginatedLogs = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredLogs.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredLogs, currentPage, itemsPerPage]);

    // Reset to page 1 when filters change
    useMemo(() => {
        setCurrentPage(1);
    }, [searchTerm, actionTypeFilter, dateFrom, dateTo, itemsPerPage]);

    const clearFilters = () => {
        setSearchTerm('');
        setActionTypeFilter('');
        setDateFrom('');
        setDateTo('');
        setCurrentPage(1);
    };

    const hasActiveFilters = searchTerm || actionTypeFilter || dateFrom || dateTo;

    const exportToCSV = () => {
        const headers = ['Timestamp', 'Actor', 'Action', 'Entity Type', 'Entity ID', 'Details'];
        const rows = filteredLogs.map((log: any) => {
            const timestamp = log.created_at?.toDate ? log.created_at.toDate().toLocaleString() : new Date(log.created_at).toLocaleString();
            return [
                timestamp,
                log.actor_name || log.actor_user_id,
                log.action_type,
                log.entity_type,
                log.entity_id,
                JSON.stringify(log.after || {})
            ];
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const getActionBadge = (action: string) => {
        if (action?.includes('CREATE') || action?.includes('ADD')) return <Badge variant="success" className="text-xs">{action}</Badge>;
        if (action?.includes('DELETE') || action?.includes('REJECT')) return <Badge variant="destructive" className="text-xs">{action}</Badge>;
        if (action?.includes('UPDATE') || action?.includes('EDIT')) return <Badge variant="secondary" className="text-xs">{action}</Badge>;
        if (action?.includes('APPROVE')) return <Badge className="text-xs bg-green-600">{action}</Badge>;
        return <Badge variant="outline" className="text-xs">{action}</Badge>;
    };

    return (
        <>
            <div className="min-h-screen bg-muted/30 p-3 md:p-4 space-y-4">
                <div className="container mx-auto max-w-7xl space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <Link to="/">
                                <Button variant="ghost" size="icon">
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                            </Link>
                            <h1 className="text-xl md:text-2xl font-bold">Audit Logs</h1>
                        </div>
                        <Button onClick={exportToCSV} variant="outline" size="sm" className="gap-2">
                            <Download className="h-4 w-4" />
                            <span className="hidden sm:inline">Export CSV</span>
                        </Button>
                    </div>

                    {/* Filters */}
                    <Card>
                        <CardContent className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Search</label>
                                    <div className="relative">
                                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Actor or Entity ID..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-8"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Action Type</label>
                                    <select
                                        value={actionTypeFilter}
                                        onChange={(e) => setActionTypeFilter(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <option value="">All Actions</option>
                                        {actionTypes.map((type) => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">From Date</label>
                                    <Input
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => setDateFrom(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">To Date</label>
                                    <Input
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => setDateTo(e.target.value)}
                                    />
                                </div>
                            </div>
                            {hasActiveFilters && (
                                <div className="mt-3 flex items-center gap-2">
                                    <Badge variant="secondary" className="gap-1">
                                        <Filter className="h-3 w-3" />
                                        {filteredLogs.length} of {logs?.length || 0} logs
                                    </Badge>
                                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 gap-1">
                                        <X className="h-3 w-3" />
                                        Clear Filters
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Desktop Table View */}
                    <Card className="hidden md:block">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5" /> System Activity
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
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
                                            <TableRow><TableCell colSpan={5} className="text-center h-24">Loading logs...</TableCell></TableRow>
                                        ) : paginatedLogs.length > 0 ? (
                                            paginatedLogs.map((log: any) => (
                                                <TableRow
                                                    key={log.id}
                                                    className="cursor-pointer hover:bg-muted/50"
                                                    onClick={() => setSelectedLog(log)}
                                                >
                                                    <TableCell className="text-xs whitespace-nowrap">
                                                        {log.created_at?.toDate ? log.created_at.toDate().toLocaleString() : new Date(log.created_at).toLocaleString()}
                                                    </TableCell>
                                                    <TableCell className="text-sm font-medium">{log.actor_name || log.actor_user_id}</TableCell>
                                                    <TableCell>
                                                        {getActionBadge(log.action_type)}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">{log.entity_type} #{log.entity_id}</TableCell>
                                                    <TableCell className="text-xs max-w-[200px] truncate" title={JSON.stringify(log.after)}>
                                                        {JSON.stringify(log.after || {})}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow><TableCell colSpan={5} className="text-center h-24">No logs found</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Mobile Timeline View */}
                    <div className="md:hidden space-y-3">
                        {isLoading ? (
                            <Card>
                                <CardContent className="text-center py-12 text-muted-foreground">Loading logs...</CardContent>
                            </Card>
                        ) : paginatedLogs.length > 0 ? (
                            paginatedLogs.map((log: any) => (
                                <Card key={log.id} onClick={() => setSelectedLog(log)} className="cursor-pointer active:scale-[0.98] transition-transform">
                                    <CardContent className="p-3 space-y-3">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                {getActionBadge(log.action_type)}
                                            </div>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <Clock className="h-3 w-3" />
                                                <span>
                                                    {log.created_at?.toDate ? log.created_at.toDate().toLocaleTimeString() : new Date(log.created_at).toLocaleTimeString()}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {log.created_at?.toDate ? log.created_at.toDate().toLocaleDateString() : new Date(log.created_at).toLocaleDateString()}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm">
                                            <User className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-medium">{log.actor_name || log.actor_user_id}</span>
                                        </div>
                                        <div className="text-xs">
                                            <div className="text-muted-foreground mb-1">Entity</div>
                                            <div className="font-medium">{log.entity_type} #{log.entity_id}</div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        ) : (
                            <Card>
                                <CardContent className="text-center py-12 text-muted-foreground">No logs found</CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Pagination */}
                    {filteredLogs.length > 0 && (
                        <Card>
                            <CardContent className="p-4">
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <span>Show</span>
                                        <select
                                            value={itemsPerPage}
                                            onChange={(e) => setItemsPerPage(Number(e.target.value))}
                                            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                                        >
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                        </select>
                                        <span>
                                            of {filteredLogs.length} logs
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <span className="text-sm">
                                            Page {currentPage} of {totalPages}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages}
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            {/* Detail Modal */}
            <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            Audit Log Details
                        </DialogTitle>
                    </DialogHeader>
                    {selectedLog && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-xs font-medium text-muted-foreground mb-1">Timestamp</div>
                                    <div className="text-sm">
                                        {selectedLog.created_at?.toDate
                                            ? selectedLog.created_at.toDate().toLocaleString()
                                            : new Date(selectedLog.created_at).toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-muted-foreground mb-1">Action</div>
                                    <div>{getActionBadge(selectedLog.action_type)}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-muted-foreground mb-1">Actor</div>
                                    <div className="text-sm font-medium">{selectedLog.actor_name || selectedLog.actor_user_id}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-muted-foreground mb-1">Entity</div>
                                    <div className="text-sm">{selectedLog.entity_type} #{selectedLog.entity_id}</div>
                                </div>
                            </div>

                            {selectedLog.after && Object.keys(selectedLog.after).length > 0 && (
                                <div>
                                    <div className="text-xs font-medium text-muted-foreground mb-2">After State</div>
                                    <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                                        {JSON.stringify(selectedLog.after, null, 2)}
                                    </pre>
                                </div>
                            )}

                            {selectedLog.before && Object.keys(selectedLog.before).length > 0 && (
                                <div>
                                    <div className="text-xs font-medium text-muted-foreground mb-2">Before State</div>
                                    <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                                        {JSON.stringify(selectedLog.before, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
};

export default AuditLogsPage;
