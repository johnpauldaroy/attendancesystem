import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, FileText, Clock, User } from 'lucide-react';
import { Link } from 'react-router-dom';

const AuditLogsPage = () => {
    const { data: logs, isLoading } = useQuery({
        queryKey: ['audit-logs'],
        queryFn: async () => {
            const querySnapshot = await getDocs(collection(db, 'audit_logs'));
            const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
            return data.sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
        }
    });

    const getActionBadge = (action: string) => {
        if (action?.includes('CREATE') || action?.includes('ADD')) return <Badge variant="success" className="text-xs">{action}</Badge>;
        if (action?.includes('DELETE') || action?.includes('REJECT')) return <Badge variant="destructive" className="text-xs">{action}</Badge>;
        if (action?.includes('UPDATE') || action?.includes('EDIT')) return <Badge variant="secondary" className="text-xs">{action}</Badge>;
        if (action?.includes('APPROVE')) return <Badge className="text-xs bg-green-600">{action}</Badge>;
        return <Badge variant="outline" className="text-xs">{action}</Badge>;
    };

    return (
        <div className="min-h-screen bg-muted/30 p-3 md:p-4 space-y-4">
            <div className="container mx-auto max-w-6xl space-y-4">
                <div className="flex items-center gap-4">
                    <Link to="/">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <h1 className="text-xl md:text-2xl font-bold">Audit Logs</h1>
                </div>

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
                                    ) : logs && logs.length > 0 ? (
                                        logs.map((log: any) => (
                                            <TableRow key={log.id}>
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
                    ) : logs && logs.length > 0 ? (
                        logs.map((log: any) => (
                            <Card key={log.id}>
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
                                    {log.after && Object.keys(log.after).length > 0 && (
                                        <div className="text-xs">
                                            <div className="text-muted-foreground mb-1">Details</div>
                                            <div className="bg-muted p-2 rounded font-mono text-[10px] break-all">
                                                {JSON.stringify(log.after, null, 2)}
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))
                    ) : (
                        <Card>
                            <CardContent className="text-center py-12 text-muted-foreground">No logs found</CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AuditLogsPage;
